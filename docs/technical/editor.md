# Editor

[← Technical TOC](README.md)

The note body is edited with **TipTap 3** (a typed React wrapper around ProseMirror). The editor is defined in `components/app/Editor.tsx` (~412 lines — the largest component in the repo).

---

## Extensions

Loaded in `Editor.tsx`:

- **`StarterKit`** — paragraph, headings, bold, italic, strike, code, inline code, blockquote, bullet/ordered lists, horizontal rule, hard break, history.
- **`TaskList` + `TaskItem`** — checklists with checkboxes.
- **`Image`** — inline images (referenced by URL).
- **`Placeholder`** — prompt text when the doc is empty.

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

Unit-tested in `lib/editor/prosemirror-utils.test.ts`.

---

## Markdown Round-Trip

Markdown is a transport format, not a storage format. It's used for **import** and **export** only.

- **Markdown → PM JSON:** `lib/markdown/from-markdown.ts`, using `marked` for tokenisation and then a hand-rolled mapper to PM nodes.
- **PM JSON → Markdown:** `lib/markdown/to-markdown.ts`, a recursive serialiser over node/mark types.

Both directions are tested in `lib/markdown/markdown.test.ts`. Covered: headings, paragraphs, blockquotes, bullet/ordered/task lists, bold/italic/strike/inline code, images, hard breaks.

Not covered (and therefore not guaranteed on round-trip): tables, footnotes, raw HTML.

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

## Extending the Editor

To add a new extension:

1. `npm install @tiptap/extension-<name>`.
2. Import in `Editor.tsx` and add to the `extensions` array of `useEditor()`.
3. If the new node type produces marks/nodes not covered by `docToPlainText()`, update the walker so plain-text search keeps working.
4. If Markdown round-trip should support it, update **both** `from-markdown.ts` and `to-markdown.ts`, and add a test in `markdown.test.ts`.

Don't store editor state outside `notes.content`. The dual storage (JSON + mirror) is intentional and limited to those two columns — no third representation should appear.
