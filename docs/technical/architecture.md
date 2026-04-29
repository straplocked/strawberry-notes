# Architecture

[← Technical TOC](README.md)

Strawberry Notes is a single-tenant-per-deployment, multi-user web app for Markdown/rich-text notes. It ships as one Next.js process plus a Postgres sidecar and a local uploads volume.

---

## System Overview

```
┌─────────────────────────────────────────────────────┐
│ Browser (PWA)                                       │
│   React 19 + TipTap editor + service worker (SWR)   │
└─────────────────┬───────────────────────────────────┘
                  │  HTTPS (proxy terminates TLS)
┌─────────────────▼───────────────────────────────────┐
│ Next.js 16 (standalone, App Router)                 │
│   ├── app/(auth)         — login / signup pages     │
│   ├── app/(app)/notes    — main 3-pane shell        │
│   ├── app/api/*          — REST endpoints           │
│   └── lib/*              — shared server/client libs│
└─────────┬─────────────────────────────┬─────────────┘
          │                             │
┌─────────▼─────────┐          ┌────────▼────────┐
│ Postgres 16       │          │ /data/uploads   │
│ Drizzle schema    │          │ (named volume)  │
└───────────────────┘          └─────────────────┘
```

No separate API server; Next.js is the whole backend.

---

## Routing Model

All user-facing routing lives in `app/`:

| Path                            | Type            | Purpose                                                                 |
| ------------------------------- | --------------- | ----------------------------------------------------------------------- |
| `app/page.tsx`                  | Page            | Root — redirects to `/notes`.                                           |
| `app/(auth)/login`              | Page            | Credentials sign-in form.                                               |
| `app/(auth)/signup`             | Page            | New-account form (404s when `ALLOW_PUBLIC_SIGNUP` is unset / false).    |
| `app/(app)/notes`               | Page            | Main 3-pane shell (sidebar / note list / editor).                       |
| `app/(app)/settings`            | Page            | Settings — Tags rename/merge, Personal Access Tokens, MCP client config. |
| `app/(app)/layout.tsx`          | Layout          | Calls `auth()`; redirects unauthenticated users to `/login`.            |
| `app/api/auth/[...nextauth]`    | Route handler   | Auth.js NextAuth endpoints.                                             |
| `app/api/auth/signup`           | Route handler   | Custom signup endpoint (gated, rate-limited, seeds `Journal` + Welcome note). |
| `app/api/notes`                 | Route handler   | List / create notes.                                                    |
| `app/api/notes/counts`          | Route handler   | Top-level counts (all / pinned / trash) for sidebar badges.             |
| `app/api/notes/titles`          | Route handler   | `[[`-autocomplete typeahead (pg_trgm-backed).                           |
| `app/api/notes/search/semantic` | Route handler   | Semantic (pgvector) search; bearer-auth-capable.                        |
| `app/api/notes/import`          | Route handler   | Import `.md` files (multipart) or a JSON Markdown blob (web clipper).    |
| `app/api/notes/[id]`            | Route handler   | Get / patch / delete single note.                                       |
| `app/api/notes/[id]/export.md`  | Route handler   | Export note as Markdown.                                                |
| `app/api/notes/[id]/backlinks`  | Route handler   | Notes that link here via `[[Title]]`.                                   |
| `app/api/export/all.zip`        | Route handler   | Streams a full-workspace zip (`?includeTrash=1` to keep soft-deleted). |
| `app/api/folders`               | Route handler   | List / create folders. Bearer-capable on GET (extension folder picker). |
| `app/api/folders/[id]`          | Route handler   | Patch (name / colour / position / parent) or delete folder + subtree.   |
| `app/api/tags`                  | Route handler   | List tags with counts.                                                  |
| `app/api/tags/[id]`             | Route handler   | Rename (with merge) or delete a tag.                                    |
| `app/api/uploads`               | Route handler   | Upload image attachment.                                                |
| `app/api/uploads/[id]`          | Route handler   | Serve attachment (ownership-checked).                                   |
| `app/api/attachments/gc`        | Route handler   | Sweep orphaned attachments (5-minute grace window).                     |
| `app/api/tokens`                | Route handler   | List / create Personal Access Tokens (session-only; mints `snb_…`).     |
| `app/api/tokens/[id]`           | Route handler   | Revoke a token.                                                         |
| `app/api/webhooks`              | Route handler   | List / create outbound webhooks (session-only; mints `whsec_…`).        |
| `app/api/webhooks/[id]`         | Route handler   | Patch (events / url / enabled / resetFailures) or delete a webhook.     |
| `app/api/webhooks/[id]/test`    | Route handler   | Send a synthetic `note.created` payload for diagnostics.                |
| `app/api/mcp`                   | Route handler   | Model Context Protocol server (bearer-only, stateless JSON-RPC).        |
| `app/api/health`                | Route handler   | Public readiness probe; pings Postgres with a 1 s timeout.              |
| `app/manifest.ts`               | Metadata route  | Emits PWA `manifest.webmanifest`.                                       |

Route groups:

- `(auth)` — unauthenticated pages.
- `(app)` — authenticated pages (guarded by the group's `layout.tsx`).

There is **no `middleware.ts`** — auth is enforced by the `(app)` layout and by `requireUserId()` inside each API route.

---

## Request Lifecycle

### Page requests (`/notes`)

1. `app/(app)/layout.tsx` calls `auth()` (from `lib/auth.ts`).
2. No session → `redirect('/login')`.
3. Session → renders `components/app/AppShell.tsx`, which mounts the React Query + Zustand providers from `components/app/Providers.tsx`.
4. AppShell kicks off queries for folders, tags, and the note list.

### API requests (`/api/*`)

1. Route handler calls `requireUserId()` (`lib/auth/require.ts`).
2. No session → `401` response.
3. Session → handler pulls `userId` and runs a Drizzle query against Postgres, scoping every `WHERE` clause to that user.
4. For uploads, the handler also verifies filesystem ownership before streaming.

### Mutations (client → server)

1. Client component calls a hook from `lib/api/hooks.ts`.
2. Hook fires a fetch against `lib/api/client.ts` (simple JSON wrapper).
3. React Query handles optimistic updates and cache invalidation (see `usePatchNote`).
4. Server mutates Drizzle + filesystem and returns the updated DTO.

---

## State Layering

| Concern          | Tool                              | Location                          |
| ---------------- | --------------------------------- | --------------------------------- |
| Server state     | React Query                       | `lib/api/hooks.ts`                |
| UI state         | Zustand                           | `lib/store/ui-store.ts`           |
| Per-note editor  | TipTap / ProseMirror              | `components/app/Editor.tsx`       |
| Auth session     | Auth.js JWT (cookie)              | `lib/auth.ts`                     |
| User preferences | Zustand → `localStorage`          | `lib/store/ui-store.ts`           |

The split is deliberate: anything that comes from the server lives in React Query; anything purely visual (theme, density, which view is active) lives in Zustand and persists to `localStorage` where relevant.

---

## Offline / PWA

- `app/manifest.ts` emits a PWA manifest with `display: standalone`, `start_url: /notes`.
- `public/sw.js` is a vanilla service worker registered in `components/app/Providers.tsx` (production only).
- Strategy:
  - **Network-first** for HTML navigations.
  - **Stale-while-revalidate** for `GET /api/notes` listings.
  - **Cache-first** for static assets.
- No offline write queue — edits require connectivity. The service worker is read-only SWR.

---

## Content Model

A note has two parallel representations of its body:

- **`notes.content`** — ProseMirror JSON (JSONB). Source of truth for the editor.
- **`notes.contentText`** — flattened plain text, rewritten on every PATCH. Used for full-text search and for the note-list snippet.

Conversion helpers live in `lib/editor/prosemirror-utils.ts`. Markdown import/export goes through `lib/markdown/from-markdown.ts` and `lib/markdown/to-markdown.ts` — both are round-trip tested in `lib/markdown/markdown.test.ts`.

---

## Security Model (Summary)

- **AuthN:** credentials (email + bcrypt), JWT session cookie.
- **AuthZ:** every query and every upload read is scoped to `session.user.id`. There is no cross-user sharing in v1.
- **Transport:** the app never terminates TLS itself — deploy behind Caddy / nginx / Cloudflare.
- **Uploads:** MIME-whitelisted (images only), size-capped, served only to their owner.

Full scope/out-of-scope in [SECURITY.md](../../SECURITY.md) at the repo root.

---

## What's Deliberately Simple

- No background workers, no queues.
- No server actions — REST only.
- No CSS-in-JS runtime — inline style objects + CSS custom properties.
- No feature flags, no A/B infrastructure.
- No multi-tenancy / organisations. Users are flat.

These are constraints, not omissions — see [leadership/roadmap.md](../leadership/roadmap.md) for the explicit non-goals.
