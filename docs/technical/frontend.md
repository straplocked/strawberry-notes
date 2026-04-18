# Frontend

[← Technical TOC](README.md)

All UI is client-rendered React, organised under `components/`. Routing + layouts live in `app/`. There are **no server actions** — every mutation is a REST call through React Query.

---

## Component Map

### `components/app/`

| File                | ~Lines | Role                                                                                                         |
| ------------------- | -----: | ------------------------------------------------------------------------------------------------------------ |
| `Providers.tsx`     |     37 | Root client provider — wraps the tree in `SessionProvider` + `QueryClientProvider`; registers the SW in prod. |
| `AppShell.tsx`      |    202 | Top-level three-pane orchestrator. Reads Zustand view state; fires folder/tag/note queries.                  |
| `Sidebar.tsx`       |    279 | Left pane: folders (with counts), pinned, trash, tags, theme/accent/density picker, logout.                  |
| `NoteList.tsx`      |    265 | Middle pane: search bar + filtered list; shows snippet, date, tags, pin indicator, image thumbnail.          |
| `Editor.tsx`        |    412 | Right pane: TipTap editor with toolbar, metadata header, autosave (see [editor.md](editor.md)).              |
| `Tweaks.tsx`        |    235 | Modal settings panel: theme (dark/light), accent, density, sidebar toggle.                                   |

### `components/icons/`

| File         | Role                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| `index.tsx`  | ~40 SVG icon components (IconBold, IconPin, IconBerry, …). Pure, no deps; inline `<svg>` definitions. |

---

## State Model

Two stores, cleanly separated:

### React Query — server state

`lib/api/hooks.ts` exposes typed query/mutation hooks:

- `useFolders()`, `useTags()`, `useNotesList(view, q)`, `useNote(id)`
- `useCreateNote()`, `usePatchNote()`, `useDeleteNote()`, `useCreateFolder()`

Query keys are centralised in the `qk` object in the same file (e.g. `qk.notes.list(view, q)`), so invalidations are consistent.

`usePatchNote` does optimistic updates on the cached note and rolls back on error.

### Zustand — UI state

`lib/store/ui-store.ts` holds:

- `view: FolderView` — discriminated union (`all` | `pinned` | `trash` | `folder:<id>` | `tag:<id>`). Helper `folderViewKey(v)` flattens it into a string for query-key use.
- `activeNoteId: string | null`
- `search: string`
- `settings: { theme, accent, density, sidebarHidden }`
- `tweaksOpen: boolean`

`settings` is the only slice persisted (to `localStorage` via `zustand/middleware`). `applyThemeVars(settings)` writes CSS custom properties (`--berry`, `--ink`, `--surface`, …) onto `document.documentElement` whenever settings change.

### Why two stores

- React Query owns anything the server can recompute.
- Zustand owns anything that only exists in the browser.

Mixing them (e.g. caching the current view in React Query) would make invalidation noisy. Keeping them separate also means the whole UI state model is ~100 lines and obvious.

---

## Styling & Theming

No CSS-in-JS runtime, no Tailwind, no CSS modules. Every component uses:

1. **Inline style objects** for layout and variable-driven colours.
2. **CSS custom properties** defined on `:root` by `applyThemeVars()` in `ui-store.ts`.
3. A tiny amount of global CSS in `app/globals.css` for resets and body defaults.

The accent palette lives in `lib/design/accents.ts`:

- `strawberry`, `leaf`, `jam`, `cherry`, `mint`, `ink`
- Each palette exports the same token shape (`berry`, `ink`, `surface`, `line`, …).

To add a new accent: drop a new entry into `accents.ts` with the same keys; the picker in `Tweaks.tsx` auto-picks it up if you add its id to the dropdown.

Density (`dense`/`balanced`/`comfy`) is applied as a CSS variable modifier that scales padding and font-size in a few hot spots (list rows, toolbar buttons). Not a global rem scale.

---

## PWA / Service Worker

- `app/manifest.ts` — PWA manifest (name, icons, theme colours, `start_url: /notes`).
- `public/sw.js` — vanilla service worker (~82 lines):
  - Precache the app shell.
  - **Stale-while-revalidate** for `GET /api/notes` (listings).
  - **Network-first** for navigations.
  - **Cache-first** for static assets.
- Registered in `components/app/Providers.tsx`, **only when `NODE_ENV === 'production'`** — dev is always live.

The service worker is read-only. Mutations always hit the network.

There is a Dexie dependency (`dexie` in `package.json`) for a future offline write queue, but no write-queue code ships in v1.

---

## Conventions

- Every file in `components/app/` is a Client Component (`'use client'` at top).
- Data fetching goes through `lib/api/hooks.ts`, never raw `fetch()` inline.
- New UI state → extend the Zustand store rather than prop-drilling.
- New icons → add to `components/icons/index.tsx` rather than ad-hoc inline SVGs.
- File-size-wise, the big four (`AppShell`, `Sidebar`, `NoteList`, `Editor`, `Tweaks`) are past the 200-line mark. If one of them grows past ~500 lines, split subcomponents into sibling files — do **not** create a new directory depth unless multiple components cluster around a theme.
