# Browser Extension (Web Clipper)

[← Technical TOC](README.md)

Strawberry Notes ships a Manifest V3 browser extension at [`extension/`](../../extension/) that clips web pages (or selections) directly into the signed-in user's note store via a personal access token.

The extension is **self-contained**: it has its own `package.json`, `tsconfig.json`, and esbuild config. It does not pollute the root `package.json` with browser-only dependencies, and the root `tsconfig.json` / `eslint.config.mjs` exclude the `extension/` directory so the `chrome` globals don't leak into root tooling.

---

## Layout

```
extension/
├── manifest.json                 — MV3 manifest (Chrome + Firefox Gecko ID)
├── build.mjs                     — esbuild config; outputs dist/
├── package.json                  — own deps (turndown), own scripts
├── tsconfig.json
├── .gitignore                    — dist/, node_modules/
├── README.md                     — operator install instructions
├── public/icons/icon{16,48,128}.png
└── src/
    ├── background.ts             — service worker: tab queries, clip dispatch
    ├── content/clip.ts           — injected into the page; picks article/main/body, sends HTML
    ├── popup/
    │   ├── popup.html
    │   ├── popup.css
    │   └── popup.ts              — settings form + Clip buttons
    └── lib/
        ├── api.ts                — fetch wrapper with bearer token
        └── turndown.ts           — Markdown converter config
```

---

## Install (Chrome)

```bash
cd extension
npm install
npm run build                     # produces extension/dist/
```

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and pick `extension/dist`.
4. The Strawberry Notes icon appears in the toolbar.

### Configure

1. In the app, sign in, go to **Settings → Personal Access Tokens**, create a token, copy it.
2. Click the extension icon, paste:
   - **Server URL** (e.g. `http://localhost:3200` or `https://notes.example.com`)
   - **Access token** (`snb_...`)
3. Click **Save**. The folder dropdown populates from `GET /api/folders` immediately.

---

## Install (Firefox)

1. Build the same way.
2. Go to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and pick `extension/dist/manifest.json`.

The extension works until Firefox restarts. Production distribution would require AMO signing; not scoped for v1.2.

---

## Clipping flow

1. User clicks the toolbar icon → popup loads `chrome.storage.local` → shows the form.
2. User picks target folder + tags, clicks **Clip page** or **Clip selection**.
3. The service worker sends a message to the active tab; the content script extracts HTML (priority: selection if any, else `<article>`, else `<main>`, else `<body>`) and hands it back.
4. `turndown` (bundled into `dist/content.js`) converts HTML to Markdown.
5. `POST https://<server>/api/notes/import` with `{ markdown, title, folderId, tagNames, sourceUrl }` and `Authorization: Bearer <token>`.
6. The server inserts the note, prepends `> Source: <url>` if `sourceUrl` was set, returns `{ imported: 1, id: <uuid> }`.

Images are left as remote URLs — re-uploading would require per-image fetch + `POST /api/uploads` + Markdown rewrite. Documented in `extension/README.md` as a follow-up.

---

## Server-side integration

Two routes were widened to support the extension. Both changes are additive and backward-compatible for the existing session-cookie callers.

### `POST /api/notes/import`

- Accepts `application/json` alongside the existing `multipart/form-data` flow — selected by `Content-Type`.
- JSON body validated by Zod: `{ markdown, title?, folderId?, tagNames?, sourceUrl? }`.
- Auth via `requireUserIdForApi` (cookie OR bearer).
- **Folder ownership is verified on every insert** — a bearer request cannot plant a note in another user's folder.
- Responds to `OPTIONS` for CORS preflight.

### `GET /api/folders`

- Auth widened to accept bearer tokens (POST remains session-only).
- Responds to `OPTIONS`.

### CORS helper (`lib/http/cors.ts`)

- `Access-Control-Allow-Origin` is restricted to `chrome-extension://`, `moz-extension://`, or `safari-web-extension://` URLs — third-party web pages get `'null'` and cannot read responses cross-origin.
- The bearer token remains the real access gate; the origin allowlist is defence in depth.
- `Access-Control-Allow-Credentials` is not set (extension uses `credentials: 'omit'`).

### Auth (`lib/auth/require-api.ts`)

`requireUserIdForApi` tries bearer first, falls through to session cookie. A bad bearer hard-fails (does not silently fall through to cookie) — so an attacker can't swap a cookie in under a mismatched bearer.

---

## Security considerations

- Tokens live in `chrome.storage.local` (never `sync`, never written to content script, never logged).
- Tokens carry the same access as the user's password — no scopes in v1.2. Revoke in Settings on compromise.
- **Private Notes are invisible to the clipper.** The clipper authenticates with the same `apiTokens` table MCP uses, so Private Notes (see [private-notes.md](private-notes.md)) are excluded from any read the clipper performs against `/api/notes/*`. The clipper is write-only in practice — it `POST`s to `/api/notes/import` — so the visibility constraint mostly matters for any future "read existing notes from the clipper popup" feature.
- `turndown` is bundled — no remote code fetch at runtime (MV3 forbids it).
- Permissions are minimal: `activeTab`, `scripting`, `storage`, `<all_urls>`. `<all_urls>` is justified by "clip any page"; the content script runs only on user-initiated click.

---

## Known gaps

- **No image re-upload** — clipped images stay as remote URLs. See `extension/README.md` for the shape of the follow-up.
- **No Readability extraction** — MVP sends `<article>` / `<main>` / `<body>`. A Readability pre-pass would produce cleaner captures but is non-trivial for the extension bundle size.
- **No context-menu / keyboard shortcut** — both are trivial follow-ups via `commands` / `contextMenus` permissions.
- **Firefox signing** — temporary add-on only; AMO submission not scoped for v1.2.
