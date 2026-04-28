# Frontend

[← Technical TOC](README.md)

All UI is client-rendered React, organised under `components/`. Routing + layouts live in `app/`. There are **no server actions** — every mutation is a REST call through React Query.

---

## Component Map

### `components/app/`

| File                | ~Lines | Role                                                                                                         |
| ------------------- | -----: | ------------------------------------------------------------------------------------------------------------ |
| `Providers.tsx`     |     37 | Root client provider — wraps the tree in `SessionProvider` + `QueryClientProvider`; registers the SW in prod. |
| `AppShell.tsx`      |    616 | Top-level three-pane orchestrator. Reads Zustand view state; fires folder/tag/note queries; owns the mobile pane state machine, action sheets, confirm dialogs, and folder-colour-change handler. |
| `Sidebar.tsx`       |    884 | Left pane: nested folder tree (chevron collapse/expand, per-row hover actions, drag-target zones, folder colour-dot picker), Library/Time/Trash nav, tag cloud, theme + sign-out footer. |
| `NoteList.tsx`      |    380 | Middle pane: search bar + filtered list; snippet, date, tags, pin indicator, image thumbnail. |
| `Editor.tsx`        |    693 | Right pane: TipTap editor with toolbar, metadata header (inline tag editor lives here), autosave. See [editor.md](editor.md). |
| `Tweaks.tsx`        |    259 | Modal settings panel: theme (dark/light), accent, density, sidebar toggle.                                   |
| `TagEditor.tsx`     |    ~190 | Inline tag-chip editor used in the editor's metadata header; autocomplete-aware. |
| `WikiLinkPopup.tsx` |    ~140 | Floating typeahead for the `[[` autocomplete. |
| `BacklinksPanel.tsx`|     ~80 | "Linked from" panel under the editor. |
| `ActionSheet.tsx`   |    ~120 | Bottom-sheet action menu (mobile note ⋯ menu, folder picker). |
| `ConfirmDialog.tsx` |     ~70 | Modal confirm — destructive folder/note delete. |
| `MobileTopBar.tsx`  |     ~80 | Mobile-only top bar that drives the three-pane state machine. |

### `components/app/settings/`

| File                       | Role                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `TokensSection.tsx`        | Personal Access Tokens — mint, list, revoke. See [mcp.md](mcp.md).                  |
| `TagsSection.tsx`          | Tag rename / merge / delete UI. Renaming to an existing name confirms then merges.  |
| `McpClientsSection.tsx`    | Static helper text + Claude Desktop / Cursor config snippets.                       |

### `components/icons/`

| File         | Role                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| `index.tsx`  | ~40 SVG icon components (IconBold, IconPin, IconBerry, …). Pure, no deps; inline `<svg>` definitions. |

---

## State Model

Two stores, cleanly separated:

### React Query — server state

`lib/api/hooks.ts` exposes typed query/mutation hooks:

- Queries: `useFolders()`, `useTags()`, `useNotesList(view, q)`, `useNote(id)`, `useNoteCounts()`, `useNoteTitles(q, enabled)`, `useBacklinks(id)`.
- Note mutations: `useCreateNote()`, `usePatchNote()`, `useDeleteNote()`.
- Folder mutations: `useCreateFolder()`, `usePatchFolder()`, `useDeleteFolder()`.
- Tag mutations: `usePatchTag()` (rename + merge), `useDeleteTag()`.

Query keys are centralised in the `qk` object in the same file (e.g.
`qk.notesList(view, q)`), so invalidations are consistent.

`usePatchNote` does optimistic updates across every cached notes list, the
single-note cache, the folders cache (count deltas), and the tag cloud (new
tag names get injected immediately via `injectOptimisticTags`). Rollback is
fully wired on error. `useDeleteFolder` walks the descendant subtree
optimistically so the cascade-delete on the server doesn't briefly orphan
sub-folders at the tree root.

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
3. A small set of state-rule classes in `app/globals.css` for hover/active
   paint that inline styles cannot express (inline `style` always wins over
   stylesheet `:hover`).

The state-rule classes (`.sn-nav-row[--active]`, `.sn-icon-btn[--danger]`,
`.sn-tag-chip[--active]`, `.sn-list-row`, `.sn-btn-ghost[--danger]`,
`.sn-dot-btn`, `.sn-swatch`) own *only* the rest/hover/active backgrounds
and ink. Everything else — sizing, padding, gap, dynamic colour from data
like `folder.color` — stays inline. Components add the className to opt in
and *omit* the relevant `background` / `color` from their inline style so
the stylesheet rule actually composes.

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
- File-size-wise, several `components/app/` files are past the 500-line mark (`Sidebar.tsx` ~880, `Editor.tsx` ~700, `AppShell.tsx` ~620). When one of them gains a self-contained subsystem (the sidebar's nested-folder tree + colour picker, the editor's wiki-link plumbing), prefer hoisting helpers (`buildFolderTree`, `extractWikiLinks`) into `lib/notes/` over fragmenting the component file. New top-level UI surfaces get sibling files in `components/app/` rather than a new directory depth.
