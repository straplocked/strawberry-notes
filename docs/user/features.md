# Features

[← User TOC](README.md)

A guided tour of what you can actually *do*.

**On this page:** [Time filters](#time-filters) · [Folders](#folders) · [Tags](#tags) · [Pinning](#pinning) · [Wiki-Links & Backlinks](#wiki-links--backlinks) · [Search](#search) · [Trash](#trash-soft-delete) · [Checklists](#checklists) · [Images](#images) · [Markdown Export & Import](#markdown-export--import) · [Themes & Accents](#themes--accents) · [PWA / Offline](#pwa--offline) · [Browser Web Clipper](#browser-web-clipper) · [Connecting an AI assistant (MCP)](#connecting-an-ai-assistant-mcp) · [Keyboard Shortcuts](#keyboard-shortcuts) · [What's Not Here](#whats-not-here-yet)

---

## Time filters

The sidebar's **Time** section filters the note list by when each note was last touched. They behave exactly like a folder view — pick one, the second pane shows the matching notes, sorted newest-touched first.

| Filter           | What it shows                                                                |
| ---------------- | ---------------------------------------------------------------------------- |
| **Today**        | Notes you updated today (server's calendar day, since 00:00).                |
| **Yesterday**    | Notes you updated during the prior calendar day.                             |
| **Past 7 days**  | Rolling 7-day window from now. Doesn't drop yesterday's notes at midnight.   |
| **Past 30 days** | Rolling 30-day window from now.                                              |

A brand-new note shows up in **Today** immediately (and in Past 7 / 30) — there's no special "daily note" type. If you want a journal-style daily note, just hit **+** while Today is selected and start typing; it'll be there tomorrow under Yesterday.

---

## Folders

- Every note can sit in one folder, or in none (the "All notes" view).
- Folders are yours only — no one else sees them.
- **Nested folders.** Hover any folder in the sidebar and click the **+** button to create a sub-folder under it. Click the chevron to collapse / expand a subtree. Top-level folders carry a coloured dot for identity; sub-folders inherit identity from the parent.
- **Folder colour.** Click the coloured dot on any top-level folder to open a swatch popover. Pick one of the six accents (Strawberry, Leaf, Jam, Cherry, Mint, Ink blue) to commit; click outside or press Escape to dismiss.
- The `Journal` folder and a `Welcome to Strawberry Notes` note are created automatically on signup; feel free to rename, delete, or trash them.
- **Deleting a folder** removes the folder *and any nested sub-folders* below it. The notes inside don't disappear — they fall back to "All notes".

---

## Tags

The chip row above each note's title is also where you tag it.

- **Add a tag.** Click into the `+ tag` slot, type a name, press **Enter** or comma. While typing, an autocomplete dropdown shows existing tags that match — pick one with the mouse or arrow keys + Enter, or commit your typed value to create a new tag.
- **Remove a tag.** Hover a chip and click the **×** button, or press **Backspace** while the input is empty.
- **Normalisation.** Names are lowercased, trimmed, capped at 40 characters, and de-duplicated against the rest of the note's tags.
- **No setup needed.** New tags are created the first time they're used.
- **Sidebar.** The Tags section shows a cloud with counts. Click a tag to filter the note list to everything that carries it.
- **Rename / merge / delete.** Open **Settings → Tags** for the full library. Inline-rename a tag in place; renaming to a name that already exists prompts to *merge* the two (every note tagged with the source ends up tagged with the existing one, and the source disappears). Delete removes the tag from every note; the notes themselves are untouched.
- **Agents.** The same `tagNames` field is exposed on `PATCH /api/notes/:id` and on the MCP `update_note`, `add_tag`, `remove_tag`, `rename_tag`, and `delete_tag` tools.

Tags and folders are independent — a note can be in a folder *and* have tags.

---

## Pinning

- Click the pin icon on a note (in the editor header or in the list) to pin it.
- Pinned notes sort to the top of every folder/tag view.
- The **Pinned** view in the sidebar shows only pinned notes, across all folders.

---

## Wiki-Links & Backlinks

Link between your notes with `[[Title]]` syntax, just like Obsidian or Logseq — but in a web app you own.

**Typing a link:**

- Type `[[` anywhere in a note. A popup appears with matching note titles.
- Up/Down arrows to navigate, Enter or Tab to insert, Esc to dismiss.
- You can also type a title in full — `[[Meal plans]]` resolves automatically on save.
- Linked text renders as a styled chip (berry accent). Click a chip to jump to that note.

**Backlinks:**

- Under each note you'll see a **"Linked from N"** panel listing every other note that has a `[[...]]` pointing at this one.
- Click a row to jump there.
- Backlinks auto-update when you save: add or remove a link in note A and note B's panel reflects it on the next refresh.

**Unresolved links:**

- If you write `[[Trip 2027]]` and no note with that title exists yet, the link is remembered as *unresolved*. The moment you create a note titled "Trip 2027", the link resolves automatically and the backlinks panel on the new note shows where it came from.

**Renaming titles:**

- If you rename a note, existing `[[old title]]` references in other notes stay as literal text — they no longer resolve to this note. Update them or create a new note with the old title to keep the link.

---

## Search

Two modes, both scoped to your notes only.

### Full-text search (keyword)

- The search bar at the top of the middle pane searches titles and body text across every non-trashed note.
- Uses Postgres full-text search for queries ≥ 3 chars, falls back to substring match for shorter queries.
- Always scoped to your current filter (folder, tag, pinned, all).

### Semantic search (meaning)

When your server administrator has configured an embeddings provider (OpenAI, Ollama, llama.cpp, or any OpenAI-compatible endpoint), you can ask questions by meaning instead of keyword:

- "what did I decide about pricing last quarter"
- "notes about burnout"
- "how did I solve the deploy hang last time"

Results come back ranked by semantic similarity, with a score. This is especially useful when you can remember the *topic* but not the exact words you wrote.

If your server hasn't configured semantic search, the feature returns a clear "not configured" message and full-text search still works.

---

## Trash (soft delete)

- Deleting a note from the editor moves it to **Trash** rather than destroying it.
- The Trash view lets you restore a note or delete it permanently.
- Permanent deletion is irreversible (there's no secondary "really trash").
- Permanently deleting a note also removes its attached images from disk.

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
- When you hard-delete a note, its images are removed from disk automatically.

---

## Markdown Export & Import

### Per-note export

From the editor's toolbar, click the three-dots **More** button → **Export this note as Markdown**. You'll get a `.md` file with the note's title as the filename. Formatting round-trips to standard Markdown.

### Markdown import

Use the import flow to upload one or more `.md` files at once. The first top-level `# heading` becomes the note title (filename is used as a fallback).

Good for migrating in from Obsidian, Bear, Joplin, or any editor that exports `.md`.

### Full-workspace ZIP backup

**More → Export all notes as ZIP** downloads a single archive containing:

- Every note as `notes/<folder>/<title>-<id>.md` with YAML frontmatter (id, title, folderId, pinned, tags, timestamps)
- Every attached image under `uploads/`
- A `manifest.json` that maps note IDs to paths

This is the complete backup of your data — nothing is left behind. Keep it somewhere safe; you can use it to restore or migrate the whole workspace.

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

## Browser Web Clipper

A Chrome + Firefox extension (in the `extension/` directory of the repo) lets you clip any web page into Strawberry Notes with one click.

Quick setup:

1. Build the extension (`cd extension && npm install && npm run build`).
2. In Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → pick `extension/dist`. In Firefox: `about:debugging` → **Load Temporary Add-on**.
3. Create a Personal Access Token (**Settings → Personal Access Tokens** in the app).
4. Click the extension icon, enter your server URL + token, pick a target folder and tags, hit **Save**.

Then, on any page:

- **Clip page** — captures the article/main content as Markdown and posts it as a new note.
- **Clip selection** — clips only the text you've selected.

A blockquote with the source URL is automatically prepended. See [../technical/extension.md](../technical/extension.md) for the full details.

---

## Email notifications

When the operator has SMTP configured, you'll get a transactional email when something security-relevant happens on your account:

- **Password changed** — your password was just updated (by you, by a self-service reset, or by an operator).
- **New personal access token** — a new MCP / API token was minted on your account.
- **New webhook** — a new outbound webhook was added.
- **Webhook auto-disabled** — one of your webhooks hit the dead-letter threshold (5 consecutive failures) and was disabled.

Each one defaults ON because they're the "wait, that wasn't me" alert. Turn any of them off in **Settings → Email notifications**.

If the operator has set `REQUIRE_EMAIL_CONFIRMATION=true`, signup also sends a one-click confirmation link before sign-in is allowed. That one is operator-level, not per-user — your account flips to confirmed the moment you click it, and you won't see another.

---

## Webhooks

**Settings → Webhooks** lets you POST a small JSON payload to any HTTPS endpoint when something happens in your notes. Five events:

- `note.created` — a new note was created (excludes the auto-seeded Welcome note).
- `note.updated` — a note's title / content / folder / pin / tags changed (debounced 5 seconds, so a typing burst sends one webhook, not fifteen).
- `note.trashed` — a note was soft-deleted (moved to Trash).
- `note.tagged` — a tag was added to a note.
- `note.linked` — a `[[wiki-link]]` resolved to an existing note for the first time. Useful for "tell me when anything links to my daily note."

Each delivery carries an `X-Strawberry-Signature: sha256=<hex>` header — your endpoint should verify it with `HMAC-SHA-256(secret, body)`. The signing secret is shown to you **once** when you create the webhook; treat it like a password.

If your endpoint returns errors five times in a row, the webhook auto-disables. Re-enable it from the same Settings panel after fixing things on your end. The **Test** button on each row sends a synthetic `note.created` payload right now — handy for confirming your consumer (n8n / Zapier / Slack / a custom script) is wired up correctly. See [../technical/webhooks.md](../technical/webhooks.md) for the full delivery contract and signature verification recipe.

---

## Connecting an AI assistant (MCP)

Strawberry Notes speaks the [Model Context Protocol](https://modelcontextprotocol.io), so Claude Desktop, Claude Code, Cursor, and other MCP-aware clients can read and write your notes on your behalf — and, crucially, do meaning-based search and graph traversal over the same notes.

Quick setup:

1. Sign in, open the gear icon in the sidebar → **Settings**.
2. Under **Personal Access Tokens**, create a token and copy it (it's shown once).
3. Point your MCP client at `https://<your-host>/api/mcp` with `Authorization: Bearer <token>`.

What the assistant can do:

- **List, search (keyword + semantic), read, create, update notes**
- **Create folders, add / remove tags**
- **Traverse backlinks** (`get_backlinks` tool)
- **Export notes as Markdown**

See [../technical/mcp.md](../technical/mcp.md) for the full tool list and a Claude Desktop config example.

Tokens carry the same access as your password — treat them that way, and revoke any you aren't using.

**Private Notes are invisible to MCP clients and the web clipper.** See the next section.

---

## Private Notes

A note you mark **Private** is encrypted in your browser before saving. The server can't read it, the operator can't read it, your MCP-connected AI assistants can't read it, and the web clipper can't read it. The only thing that can decrypt a private note is your passphrase (or your one-time recovery code) running in your own browser.

This is the lever to pull when you want a place to put things you don't want surfaced by an LLM that has your access token. A journal entry, a list of medications, a draft of a sensitive email — anything you'd rather an agent didn't quietly index and quote back at you.

**One-time setup:**

1. Open **Settings → Private Notes**.
2. Click **Set up Private Notes** and choose a passphrase. Longer is stronger.
3. **Save the recovery code that appears.** It's the only safety net if you forget the passphrase. The setup flow won't let you continue until you confirm you've stored it. A password manager is the obvious place.

**Marking a note private:**

In any note, click the 🔒 button in the editor toolbar. The next save encrypts the body. The note still appears in your sidebar, the title and folder remain visible, and the note list shows a 🔒 next to its title — but the body shows "🔒 Private — unlock to read" until you unlock.

**Unlocking:**

Open a private note while locked → you see an Unlock button. Enter your passphrase. The note decrypts in the editor for the rest of your session, until you lock manually (Settings → Lock now), close the tab, or hit the auto-lock timer (60 minutes of inactivity by default; change it in Settings).

**Reverting a note to plaintext:**

Click 🔓 in the editor toolbar while unlocked. You'll be asked to confirm — once it's plaintext again, MCP and the clipper can see the body again, the operator can `psql` for it, and it gets indexed for full-text and semantic search like any other note.

**Important warnings:**

- **If you lose both your passphrase and your recovery code, your private notes are unrecoverable.** No one — not the operator, not Strawberry Notes, not anyone — can decrypt them. The keys live only on your devices.
- A private note's title, folder placement, and tags are still visible to the operator and to MCP. Only the body is encrypted. Don't put secrets in the title.
- Search inside private notes doesn't work — the encrypted body isn't indexable. You can find a private note by its title; you can't search for a phrase inside one.
- Wiki-links from private notes don't work either — the body is encrypted, so the server can't extract `[[Title]]` references. Plaintext notes linking to a private note's title still resolve normally.

What this defends against and what it does **not** is documented in detail in [../technical/private-notes.md](../technical/private-notes.md). The short version: it stops MCP and casual operator inspection cold; it does not stop a malicious operator who can swap the JavaScript bundle the browser runs.

---

## Keyboard Shortcuts

Standard editor shortcuts are available:

- `⌘/Ctrl + B` — bold
- `⌘/Ctrl + I` — italic
- `⌘/Ctrl + K` — (if your browser lets it through) search focus
- `⌘/Ctrl + Z` / `⌘/Ctrl + Shift + Z` — undo / redo
- `[[` — trigger the wiki-link autocomplete
- Markdown-style expansions (`#␣`, `*␣`, `[ ]␣`, `>␣`, etc.)

---

## What's Not Here (Yet)

Intentionally absent:

- Sharing a note with another user
- Real-time collaboration
- Commenting
- Public links
- OAuth sign-in
- End-to-end encryption
- Mobile-native apps

See [../leadership/roadmap.md](../leadership/roadmap.md) for what's on the table.
