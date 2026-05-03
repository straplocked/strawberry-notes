# CLAUDE.md — Strawberry Notes

Instructions for Claude (any variant) when working in this repository.

---

## Start-of-conversation routine

**Before answering anything substantive**, scan the documentation tree to establish current context. In order:

1. **Read [docs/README.md](docs/README.md)** — the master index. One minute, gives you the shape of the repo.
2. **Read the relevant audience TOC** for what the user is asking:
   - Engineering / code questions → [docs/technical/README.md](docs/technical/README.md)
   - User-experience questions → [docs/user/README.md](docs/user/README.md)
   - Product / stack / direction questions → [docs/leadership/README.md](docs/leadership/README.md)
3. **Only then read individual doc files** that the TOC points at for the specific topic.
4. For anything that touches documentation *process* (regenerating, refreshing, counting runs), read **[DOC_UPDATE.md](DOC_UPDATE.md)** — it is the source of truth for how docs are maintained.

Don't read the entire `docs/` tree on every turn — pick what's relevant. But always read at least the master index and the audience TOC.

---

## Project essentials

- **Framework:** Next.js 16 App Router (standalone output) + React 19 + TypeScript strict.
- **DB:** Postgres 16 via Drizzle. Schema: `lib/db/schema.ts`. Migrations: `drizzle/`.
- **Auth:** Auth.js v5 credentials + JWT. Config: `lib/auth.ts`. Guard: `lib/auth/require.ts`.
- **Editor:** TipTap 3 (ProseMirror JSON in `notes.content`; plain-text mirror in `notes.contentText`).
- **State:** React Query (server) + Zustand (UI, persists settings to localStorage).
- **Uploads:** local filesystem at `UPLOAD_DIR` (default `./data/uploads`). Images only.
- **Ports:** dev and prod both use **3200** on the host. Inside Docker, the container listens on 3000 and compose publishes `3200:3000`.

For anything beyond that, the docs are authoritative — do not recite from memory when the file is one `Read` away.

---

## Working style

- Edit existing files over creating new ones. Especially in `docs/` — follow [DOC_UPDATE.md](DOC_UPDATE.md)'s large-file split strategy.
- Honour the "non-bloat" line: every new dep, route, config knob, or UI surface must pay its way. See [docs/leadership/roadmap.md](docs/leadership/roadmap.md).
- Tests live next to code (`foo.ts` ↔ `foo.test.ts`). Vitest + Testing Library + jsdom.
- No server actions — REST via `app/api/*`.
- Keep the file structure flat. Don't nest beyond the existing two levels unless a topic clearly demands it.

---

## When updating documentation

If the user asks you to refresh, regenerate, or update documentation:

1. Follow **[DOC_UPDATE.md](DOC_UPDATE.md)** step-by-step.
2. Increment the run counter in that file.
3. Append the run entry to **[docs/CHANGELOG.md](docs/CHANGELOG.md)** — never to DOC_UPDATE.md itself.
4. Enforce the large-file split thresholds (250 / 400 lines).

---

## Things that would surprise a newcomer

- `components/` uses **inline CSS objects + CSS custom properties**, not Tailwind / CSS-in-JS / CSS modules.
- There is **no `middleware.ts`** — auth gating is done by the `(app)` layout and by `requireUserId()` in each API route.
- The service worker at `public/sw.js` is **read-only SWR**. There is no offline write queue in v1, even though Dexie is installed.
- `notes.contentText` is a **server-maintained mirror** of the plain-text flattening of `notes.content` — never set it from the client.
- Port **3200** is deliberate — check `docker-compose.yml` and `package.json` scripts before changing it.
- **Private Notes (v1.5):** when `notes.encryption` is non-null, `notes.content` holds a **base64 ciphertext string**, not a ProseMirror doc. Anything that calls `docToMarkdown` / `countTasks` / similar must branch on `note.encryption !== null` first. Service-layer reads gate bearer-token (MCP / clipper) callers with `includePrivate: false`. Full picture in [docs/technical/private-notes.md](docs/technical/private-notes.md).
