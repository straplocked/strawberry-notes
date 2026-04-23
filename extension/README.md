# Strawberry Notes Web Clipper

A minimal Manifest V3 browser extension (Chrome + Firefox) that clips the
current web page (or selection) to a Strawberry Notes server as Markdown.

## What it does

- Converts the active tab's main content (`<article>`, `<main>`, else `<body>`) or
  the user's current selection to Markdown via [turndown](https://github.com/mixmark-io/turndown).
- Posts to `POST /api/notes/import` as JSON: `{ markdown, title, folderId,
  tagNames, sourceUrl }`.
- Authenticates with a personal access token (`Authorization: Bearer snb_...`)
  minted from **Settings → Personal Access Tokens** inside Strawberry Notes.
- Lets the user pick a target folder (populated via `GET /api/folders`) and
  attach comma-separated tags.

The extension is self-contained under `extension/` — it is not published to
any web store. Build and side-load locally.

## Build

```bash
cd extension
npm install
npm run build     # produces ./dist
```

The build is a single `esbuild` pass per entry point (background, popup,
content script). Bundle size is ~20 KB gzipped; Turndown is the only runtime
dependency.

Dev loop (auto-rebuild on save):

```bash
npm run watch
```

## Install (Chrome / Chromium / Edge / Brave / Arc)

1. Build: `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and pick the `extension/dist` folder.
5. Pin the extension from the toolbar puzzle menu.

## Install (Firefox)

Firefox supports MV3 for temporary installs (since 121). For a persistent
install you'd need to sign through AMO, which is out of scope for v1.

1. Build: `npm run build`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and pick `extension/dist/manifest.json`.
4. The add-on disappears when the browser restarts — reload the same way.

Firefox quirks:

- `browser_specific_settings.gecko.id` in the manifest is required; ours is
  `strawberry-notes-clipper@strawberry.local`.
- `chrome.scripting.executeScript` works in MV3 Firefox but counts as a
  sensitive permission — you may see a one-time activation prompt.

## Configure

Click the toolbar icon to open the popup, then:

1. **Server URL** — e.g. `https://notes.example.com` (no trailing path). For a
   local dev server this is `http://localhost:3200`.
2. **Personal access token** — create one in the app:
   Settings → Personal Access Tokens → **Create token**. Copy the `snb_...`
   value once; only the SHA-256 hash is stored server-side.
3. Click **Save**, then **Test** to verify. The folder dropdown populates on
   success.
4. Pick a target folder and set default tags if you want. Both persist to
   `chrome.storage.local` (per-profile, not synced across devices).

## Clip

With a page open:

- **Clip page** — sends the main-content Markdown.
- **Clip selection** — sends only what's highlighted (fails with a friendly
  message if nothing is selected).

Both buttons create a single note on the server. The note body includes a
`> Source: <url>` blockquote so you can jump back to the original page from
the editor.

## Security

- Tokens live in `chrome.storage.local`. **Never** `chrome.storage.sync`,
  which would propagate the token through the browser's account sync.
- Tokens are not logged anywhere in the code; error messages include HTTP
  status codes and server `error` strings but never the bearer value.
- `credentials: 'omit'` on every fetch — the extension does not piggy-back on
  a logged-in browser session.
- The bundled `host_permissions` are `<all_urls>` so Clip works on any page.
  We only inject the content script on demand (click → `scripting.executeScript`).

## What a clip looks like on the server

A clipped page arrives as a new note:

- **Title** — the page's `document.title` (≤ 300 chars).
- **Body** — the Markdown rendered by Turndown, preceded by a
  `> Source: <url>` blockquote referencing the original page.
- **Folder** — whichever was selected in the popup (or none).
- **Tags** — upserted per-user by normalised name (lowercase, trimmed).

## Known gaps / design decisions

- **Images are left as remote URLs.** The server's `attachments` flow only
  accepts `multipart/form-data` via `/api/uploads` and is browser-only in v1
  (see `docs/technical/mcp.md`). Re-hosting requires fetching each image
  from the extension, POSTing it to `/api/uploads`, then rewriting the
  Markdown `![alt](…)` URLs. That's a worthwhile follow-up but out of scope
  for this slice.
- **No Readability-style extraction.** MVP sends `<article>` / `<main>` /
  `<body>` as-is. Some sites include navigation or sidebars in these
  elements. A later pass could integrate `@mozilla/readability`.
- **Firefox temporary-install only.** Signing is a publishing step, not a
  code step.
- **No screenshot clip.** Listed in Slice 4 as a stretch; skipped to keep
  scope tight.
- **Popup polling only.** We don't have a context-menu entry or keyboard
  shortcut yet; both are trivial to add (`contextMenus` and `commands`
  permissions + manifest entries).

## File layout

```
extension/
├── manifest.json                 MV3 manifest
├── package.json                  Extension-only deps (not wired to root)
├── build.mjs                     esbuild bundling script
├── tsconfig.json
├── public/icons/                 Toolbar icons (placeholder)
├── src/
│   ├── background.ts             Service worker (currently minimal)
│   ├── content/clip.ts           Injected into active tab on demand
│   ├── popup/popup.html
│   ├── popup/popup.css
│   ├── popup/popup.ts            Popup controller
│   └── lib/
│       ├── api.ts                fetch wrapper + chrome.storage config
│       └── turndown.ts           Turndown config + URL absolutizer
└── dist/                         Build output (gitignored)
```
