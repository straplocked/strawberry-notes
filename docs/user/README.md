# User Guide

Audience: people using Strawberry Notes — not necessarily developers.

| File                                         | What it covers                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| [getting-started.md](getting-started.md)     | Sign up, make your first note, tour of the three panes.                         |
| [features.md](features.md)                   | Folders, tags, pinning, search, semantic search, `[[wiki-links]]`, backlinks, export/import, full ZIP backup, offline, themes, MCP, web clipper. |
| [troubleshooting.md](troubleshooting.md)     | Common issues and how to fix them.                                              |

---

## What is Strawberry Notes?

A **self-hostable, AI-native notes app**. You run it on your own server; nothing lives in someone else's cloud. Beyond the usual notebook features (rich text, folders, tags, search), it adds:

- **`[[Wiki-links]]` with backlinks** — link notes by title; each note shows who links back to it.
- **Semantic search** — ask by meaning, not just keywords ("what did I decide about pricing last quarter"). Works with OpenAI, Ollama, or any compatible embeddings endpoint your server is configured for.
- **Full-workspace ZIP backup** — download every note, every image, and a manifest in one archive.
- **Web clipper** — Chrome/Firefox browser extension clips pages or selections straight into a note folder.
- **AI agent integration (MCP)** — point Claude Desktop, Cursor, or any MCP-aware client at your server and it can read, search, and write your notes on your behalf, using a personal access token.
- Rich-text editor (headings, lists, checklists, images, task counts).
- Folders, tags, pinning, soft-delete "trash".
- Full-text search across every note you own.
- Markdown export/import per note.
- Installable as a PWA; reads work offline.
- Dark/light themes with six accent colours.

It is **multi-user** (each deployment supports many accounts) but **not multi-tenant** (there are no organisations, no shared notes between users — the product is deliberately a private notebook per account).
