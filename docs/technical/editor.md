# Editor

[← Technical TOC](README.md)

The note body is edited with **TipTap 3** (a typed React wrapper around ProseMirror). The editor is defined in `components/app/Editor.tsx`.

---

## Extensions

Loaded in `Editor.tsx`:

- **`StarterKit`** — paragraph, headings, bold, italic, strike, code, inline code, blockquote, bullet/ordered lists, horizontal rule, hard break, history.
- **`TaskList` + `TaskItem`** — checklists with checkboxes.
- **`Table` + `TableRow` + `TableHeader` + `TableCell`** (`@tiptap/extension-table`) — GFM tables. `Table` is configured with `resizable: false, renderWrapper: true`: no column-drag UI (no design for it yet), but every table still renders inside a `.tableWrapper` div so a table wider than the reading column scrolls horizontally instead of blowing out the page. See [Tables](#tables) below.
- **`Image`** — inline images (referenced by URL).
- **`Placeholder`** — prompt text when the doc is empty.
- **`WikiLinkExtension`** (in-house, `lib/editor/wiki-link-plugin.ts`) — decoration-only inline chips + `[[` autocomplete popup. See [Wiki-links](#wiki-links--backlinks) below.

No collaborative editing extension (Yjs) — v1 is single-client per note at a time. Concurrent edits from two tabs "last write wins" because PATCH overwrites `content`.

---

## Storage Format

The editor's document is stored verbatim as **ProseMirror JSON** in `notes.content` (JSONB). Example (simplified):

```json
{
  "type": "doc",
  "content": [
    { "type": "heading", "attrs": { "level": 1 }, "content": [ { "type": "text", "text": "Title" } ] },
    { "type": "paragraph", "content": [ { "type": "text", "text": "Body." } ] }
  ]
}
```

On every `PATCH /api/notes/:id` that includes `content`, the server recomputes `contentText` (plain-text mirror) using `docToPlainText()` from `lib/editor/prosemirror-utils.ts`. That mirror powers full-text search and the note-list snippet.

### Helpers in `lib/editor/prosemirror-utils.ts`

- `emptyDoc()` — canonical empty doc.
- `docToPlainText(doc)` — walks nodes, inserts newlines after block nodes.
- `snippetFromDoc(doc, max = 180)` — first non-empty line, truncated.
- `docHasImage(doc)` — true if any descendant is `{ type: 'image' }`.
- `countTasks(doc)` — `{ total, done }` over all `taskItem` nodes.
- `extractWikiLinks(doc)` — returns deduplicated, lowercased `[[Title]]` titles found in any text run. Fresh regex per text node so `/g` `lastIndex` can't bleed between siblings.

Unit-tested in `lib/editor/prosemirror-utils.test.ts`.

---

## Markdown Round-Trip

Markdown is a transport format, not a storage format. It's used for **import** and **export** only.

- **Markdown → PM JSON:** `lib/markdown/from-markdown.ts`, using `marked` for tokenisation and then a hand-rolled mapper to PM nodes.
- **PM JSON → Markdown:** `lib/markdown/to-markdown.ts`, a recursive serialiser over node/mark types.

Both directions are tested in `lib/markdown/markdown.test.ts`. Covered: headings, paragraphs, blockquotes, bullet/ordered/task lists, bold/italic/strike/inline code, images, hard breaks, tables.

Not covered (and therefore not guaranteed on round-trip): footnotes, raw HTML (other than a literal `<br>` inside a table cell — see below).

---

## Tables

GFM pipe tables, via `@tiptap/extension-table`. Node shape: `table` → `tableRow` → `tableHeader` (header row) / `tableCell` (body rows), each holding `block+` content (in practice always `paragraph`).

- **Insert:** the toolbar's **More** menu (desktop) or the mobile editor-actions sheet has an **Insert table** item that runs `editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true })` — a 3×3 table with a header row.
- **Row / column / table actions:** `tableActions()` in `Editor.tsx` returns a list of `ActionSheetAction`s (add row above/below, delete row, add column left/right, delete column, delete table) whenever `editor.isActive('table')` is true — i.e. only while the caret sits inside a table. Both the desktop "More" sheet and the mobile editor-actions sheet (`AppShell.tsx`) call it, so the same affordances exist on both surfaces. These map directly to the extension's own commands (`addRowBefore`, `addRowAfter`, `deleteRow`, `addColumnBefore`, `addColumnAfter`, `deleteColumn`, `deleteTable`).
- **Styling:** `.pm :global(.tableWrapper)` in `editor.module.css` scrolls horizontally instead of forcing the whole page wider — the one part of the layout that matters most on mobile, where `.page` has little room to spare. All table colors are the same CSS custom properties used everywhere else (`--hair`, `--surface-2`, `--ink`, …), so light/dark theming needs no table-specific rules.

### Markdown shape

`lib/markdown/to-markdown.ts` renders a `table` node as a standard GFM pipe table: a header row (from the first `tableRow`), an alignment row, then one line per remaining row. `lib/markdown/from-markdown.ts` parses the inverse using `marked`'s built-in GFM table token (`header` / `align` / `rows`).

- **Alignment** lives on each cell's `align` attr (`'left' | 'center' | 'right' | null`) — the same attribute `@tiptap/extension-table` itself defines. GFM alignment is per-column, so the serializer uses whichever cell in a column declares one.
- **Escaped pipes:** a bare `|` inside a cell's rendered text (including inside a code span) is backslash-escaped so the Markdown table parser doesn't read it as an extra column delimiter; marked un-escapes it back to `|` on import. Same algorithm either side of the round trip: `/\\.|\|/g`, leaving already-escaped sequences alone.
- **Multi-paragraph cells:** a table cell's content is `block+`, so pressing Enter inside a cell produces a second paragraph. Since a pipe-table row can't span physical lines, multiple blocks (or a `hardBreak`) are joined with a literal `<br>` on export; `marked` tokenises that back into an inline `html` token on import, which splits the cell's tokens into separate paragraphs again.
- **Empty cells** round-trip as empty paragraphs (`{ type: 'paragraph' }` / `{ type: 'paragraph', content: [] }`).

Tested in `lib/markdown/markdown.test.ts`'s `table round-trip` block: per-column alignment, escaped pipes, inline code/bold inside cells (including a pipe inside a code span), empty cells, the exact shape `insertTable()` produces, and the multi-paragraph/`<br>` case.

---

## Autosave

The editor component uses `usePatchNote()` from `lib/api/hooks.ts`. React Query's mutation dedup handles debouncing: while the user types, the latest content sits in state; on every transaction `onUpdate` fires and enqueues the patch.

Because PM JSON is the source of truth, the PATCH body is `{ content: <doc> }`. The server responds with the updated DTO, which React Query swaps into the cache.

If a PATCH fails, React Query rolls the optimistic cache back. The visible edit in the editor is not reverted (TipTap has its own state) — practically the user sees an out-of-sync warning only if they reload. There is no explicit "saving…" indicator in v1.

---

## Toolbar

Inline toolbar in `Editor.tsx` exposes:

- Marks: bold, italic, underline, strike, code.
- Blocks: H1, H2, blockquote, horizontal rule.
- Lists: bullet, ordered, checklist.
- Media: image, attach (opens file picker → `POST /api/uploads` → inserts an `image` node pointing at `/api/uploads/<id>`).
- History: undo, redo.
- Note metadata: pin toggle, share / export placeholder.

Buttons map to TipTap commands (`editor.chain().focus().toggleBold().run()` and similar).

---

## Wiki-Links & Backlinks

Strawberry Notes supports `[[Title]]` internal links with a full reverse index (backlinks), a `[[` autocomplete popup, and styled inline chips — all without changing the ProseMirror document schema.

### On-disk model (`note_links` table, migration 0004)

```
source_id     uuid    references notes(id) on delete cascade
target_id     uuid    references notes(id) on delete set null   -- null while unresolved
target_title  text    lowercased title the source wrote
PRIMARY KEY (source_id, target_title)
```

### Resolution flow

1. User types `[[Other]]` somewhere in a note. The text stays literal in the doc — no new node type, no mark.
2. On every save, `syncOutboundLinks` (`lib/notes/link-service.ts`) wraps a transaction:
   - `DELETE FROM note_links WHERE source_id = :id`
   - Re-scan the doc via `extractWikiLinks(doc)`
   - One `IN` lookup to resolve titles against the user's own notes (case-insensitive)
   - Batch `INSERT` with resolved `target_id` or `NULL` for unresolved
3. When a new note is created (or renamed), `resolvePendingLinksForTitle` updates any `note_links` rows whose `target_title` matches the new title's lowercased form and whose source belongs to the same user. Stale targets from a rename are cleared by `unresolveLinksTo`.

All mutations user-scoped via an `EXISTS` subquery on `notes.userId`.

### Editor rendering

`lib/editor/wiki-link-plugin.ts` installs a ProseMirror `Plugin` that:

- Holds a `DecorationSet` of inline `.sn-wiki-link` chips over `[[...]]` runs. Rebuilt on every state transaction — O(n) over visible text; cheap at note scale.
- Watches the caret for `[[<partial>` at end-of-text-run and emits a trigger state to React; the React `<WikiLinkPopup>` reads it, queries `GET /api/notes/titles?q=...`, and lets the user pick with Up/Down/Enter/Tab/Esc.
- Guards against `[[[` (literal triple-bracket) by refusing to open when the char before the `[[` is itself `[`.
- Intercepts chip clicks: resolves the chip's `data-wiki-title` against the titles endpoint and sets `useUIStore.activeNoteId`.

### Surfacing backlinks

- `GET /api/notes/:id/backlinks` returns the source notes that link here.
- MCP tool `get_backlinks` exposes the same data for agent traversal.
- `<BacklinksPanel>` (under `EditorContent`) renders the list when the current note has any.

### Why decoration-only?

The `[[Title]]` text stays literal in the ProseMirror doc, so:

- Markdown export round-trips `[[Title]]` without special handling.
- Slice 1's server-side `extractWikiLinks` scanner works on exported Markdown re-imports too.
- There's no new node/mark type to serialise, migrate, or contend with in future TipTap majors.

---

## Extending the Editor

To add a new extension:

1. `npm install @tiptap/extension-<name>`.
2. Import in `Editor.tsx` and add to the `extensions` array of `useEditor()`.
3. If the new node type produces marks/nodes not covered by `docToPlainText()`, update the walker so plain-text search keeps working.
4. If Markdown round-trip should support it, update **both** `from-markdown.ts` and `to-markdown.ts`, and add a test in `markdown.test.ts`.

Don't store editor state outside `notes.content`. The dual storage (JSON + mirror) is intentional and limited to those two columns — no third representation should appear.
