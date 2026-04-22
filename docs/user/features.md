# Features

[← User TOC](README.md)

A guided tour of what you can actually *do*.

---

## Folders

- Every note can sit in one folder, or in none (the "All notes" view).
- Folders are yours only — no one else sees them.
- Each folder has a colour — click it in the sidebar to edit.
- The "Journal" folder is created automatically on signup; feel free to rename or delete it.
- Deleting a folder **doesn't delete its notes** — they move to "All notes".

---

## Tags

- Free-form labels. Start typing in a note's tag field and separate with commas.
- Tags are normalised: lowercased, trimmed, capped at 40 chars, duplicates removed.
- New tags are created automatically when you use them; no setup needed.
- The sidebar's Tags section shows a tag cloud with counts. Click a tag to see every note that carries it.

Tags and folders are independent — a note can be in a folder *and* have tags.

---

## Pinning

- Click the pin icon on a note (in the editor header or in the list) to pin it.
- Pinned notes sort to the top of every folder/tag view.
- The **Pinned** view in the sidebar shows only pinned notes, across all folders.

---

## Search

- The search bar at the top of the middle pane searches titles and body text of every non-trashed note.
- Uses full-text search (tokenised, typo-tolerant within reason) for queries ≥ 3 chars; falls back to substring match for shorter queries.
- Search is always scoped to what you've picked on the left — search within a folder, within a tag, or across all notes.

---

## Trash (soft delete)

- Deleting a note from the editor moves it to **Trash** rather than destroying it.
- The Trash view lets you restore a note or delete it permanently.
- Permanent deletion is irreversible (there's no secondary "really trash").

Tip: if you're about to delete something you're unsure about, just trash it. It costs nothing to keep around.

---

## Checklists

- Use the checklist toolbar button, or type `[ ]␣` at the start of a line.
- Tick boxes update instantly and autosave.
- The note metadata header shows `done / total` task progress.

---

## Images

- Click the image button in the toolbar, or drag an image into the editor.
- Supported: PNG, JPEG, WebP, GIF, SVG, AVIF.
- Per-file size limit depends on your deployment (default 10 MB; ask your admin if it's different).
- Images are stored on the server and only visible to you. They will not be shared across accounts.

---

## Markdown Export & Import

- **Export:** from a note, use the share / export action to download a `.md` file. Formatting round-trips to standard Markdown.
- **Import:** you can upload one or more `.md` files. The first top-level `# heading` becomes the note title (filename is used as a fallback).

Good for backing up, for migrating in from other tools (Obsidian, Bear, etc.), or for handing a note to someone outside the app.

---

## Themes & Accents

Open the **Tweaks** panel from the sidebar. You can change:

| Setting      | Options                                                               |
| ------------ | --------------------------------------------------------------------- |
| **Theme**    | Dark or light.                                                        |
| **Accent**   | Strawberry, leaf, jam, cherry, mint, or ink.                          |
| **Density**  | Dense / balanced / comfy — controls list-row padding and font sizing. |
| **Sidebar**  | Hide the sidebar to maximise editor space (toggle the same way back). |

All these are stored per-browser (via `localStorage`), so your phone and laptop can look different without fighting each other.

---

## PWA / Offline

- On supported browsers, you can **install** Strawberry Notes as an app (your browser surfaces an "Install" prompt or an icon in the URL bar).
- Once installed, you can launch it from your dock / home screen like a native app.
- **Offline:** if you lose connectivity after loading a recent note list, you can keep reading notes from the list. **Editing requires connectivity** — there's no offline write queue in v1.

---

## Connecting an AI assistant (MCP)

Strawberry Notes speaks the [Model Context Protocol](https://modelcontextprotocol.io), so Claude Desktop, Claude Code, Cursor, and other MCP-aware clients can read and write your notes on your behalf.

Quick setup:

1. Sign in, open the gear icon in the sidebar → **Settings**.
2. Under **Personal Access Tokens**, create a token and copy it (it's shown once).
3. Point your MCP client at `https://<your-host>/api/mcp` with `Authorization: Bearer <token>`.

The assistant gains tools to list, search, read, create, update, tag, and export your notes. See [../technical/mcp.md](../technical/mcp.md) for the full tool list and a Claude Desktop config example.

Tokens carry the same access as your password — treat them that way, and revoke any you aren't using.

---

## Keyboard Shortcuts

Standard editor shortcuts are available:

- `⌘/Ctrl + B` — bold
- `⌘/Ctrl + I` — italic
- `⌘/Ctrl + K` — (if your browser lets it through) search focus
- `⌘/Ctrl + Z` / `⌘/Ctrl + Shift + Z` — undo / redo
- Markdown-style expansions (`#␣`, `*␣`, `[ ]␣`, `>␣`, etc.)

---

## What's Not Here (Yet)

Intentionally absent in v1:

- Sharing a note with another user
- Real-time collaboration
- Commenting
- Public links
- OAuth sign-in
- End-to-end encryption
- Mobile-native apps

See [../leadership/roadmap.md](../leadership/roadmap.md) for what's on the table.
