# Getting Started

[← User TOC](README.md)

This page walks you from "I have a URL" to "I'm editing my first note".

---

## 1. Create an account

1. Open the app URL (for a default local deploy: `http://localhost:3200`).
2. On the sign-in page, click **Sign up**.
3. Enter an email and a password (minimum 8 characters).
4. Submit the form. You'll land on `/notes` signed in, with a folder called **Journal** already created for you.

There's no email verification step. The account is usable immediately.

---

## 2. The three-pane layout

Once you're in, the app is split into three vertical panes:

| Pane     | What it does                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Left** | **Sidebar** — folders, pinned notes, trash, tags, and your settings (theme/accent/density). Click anything here to change the list on the right. |
| **Middle** | **Note list** — every note that matches what you picked on the left, plus a search bar. Newest at the top (pinned first).                      |
| **Right**  | **Editor** — the currently selected note. Type to edit; your changes save automatically.                                                       |

You can hide the sidebar from the settings panel if you want more editor space.

---

## 3. Make your first note

1. Click the **+** button in the note list (middle pane).
2. A new empty note opens in the editor.
3. Click into the title at the top and give it a name.
4. Click into the body and start typing.

Your note autosaves as you type. There's no "Save" button.

---

## 4. Formatting

The toolbar above the editor covers the essentials:

- **B** bold, **I** italic, **U** underline, **S** strikethrough, **⟨⟩** inline code
- **H1 / H2** headings
- **"** blockquote, **—** horizontal rule
- Bullet list, numbered list, **checklist** (with checkboxes)
- Image upload (drag-and-drop also works)
- File attach (picks an image file from your computer)
- Undo / redo

Shortcut: type Markdown-like syntax and it expands. `#␣` → heading; `*␣` → bullet; `[ ]␣` → checklist item.

---

## 5. Organise as you go

- **Put notes in folders** — drag a note onto a folder, or pick the folder from the note's metadata header.
- **Tag notes** — add comma-separated tags in the note header. Tags are lowercased and deduplicated automatically.
- **Pin important notes** — click the pin icon on a note; it floats to the top of every view.

See [features.md](features.md) for the details.

---

## 6. Sign out

The sign-out button is at the bottom of the sidebar (next to the settings picker). Sessions are long-lived (JWT cookie) — you won't get kicked out mid-work.
