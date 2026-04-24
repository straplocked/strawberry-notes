# Product Overview

[← Leadership TOC](README.md)

---

## What It Is

Strawberry Notes is a **self-hostable, multi-user, AI-native notes application**. Each deployment runs on infrastructure the operator controls and supports an arbitrary number of user accounts. Notes are rich-text (TipTap/ProseMirror) with full-text search, semantic search over vector embeddings, folders, tags, pinning, `[[wiki-link]]` backlinks, soft-delete, image attachments, bidirectional Markdown export/import, a full-workspace ZIP export, a browser web-clipper, and a first-class Model Context Protocol endpoint so AI agents can read, search, and write notes over the same transport humans use. It installs as a Progressive Web App and degrades to read-only when offline.

---

## Class-Leader Thesis

> **The self-hosted notebook with a first-class AI + agent interface.**

No other MIT-licensed, self-hostable, multi-user notes app in 2026 combines:

1. **Rich-text web editor with `[[wiki-link]]` backlinks** — parity with Obsidian / Logseq for the graph-of-notes workflow, without the Electron client or the paid-sync tier.
2. **Semantic search over your own notes** — pgvector + any OpenAI-compatible embeddings endpoint (OpenAI, Ollama, llama.cpp, vLLM, LM Studio). Ask "what did I decide about pricing last quarter" and get back the note, not a keyword match.
3. **Native MCP server** — Claude Desktop, Claude Code, Cursor, and any MCP-speaking agent can read, search (FTS *and* semantic), create, update, tag, traverse backlinks, and export your notes. Personal access tokens are SHA-256 at rest, scoped to the owning user.
4. **Full-workspace backup as a streaming ZIP** — one HTTP call returns every note as Markdown with frontmatter, every attachment, and a `manifest.json` for symmetric re-import.
5. **Browser web-clipper (MV3)** — Chrome and Firefox extension that clips pages or selections straight into a note folder via a personal access token.
6. **Postgres + Drizzle** — operators already know `pg_dump`, replicas, and backups. No proprietary sync protocol.

Closest comparisons and where they fall short:

| Competitor        | What they own                           | Where we lead                                                             |
| ----------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| **Joplin**        | Huge plugin ecosystem, native apps.     | Web-first. No Electron. Semantic search + MCP in the core, not plugins.   |
| **Obsidian**      | Graph / plugins / market share.         | MIT (not proprietary). Self-hosted web. Multi-user. No paid sync.         |
| **Standard Notes**| E2EE; paid extensions.                  | Rich-text first-class. Semantic + MCP. Zero-config self-host.             |
| **Logseq**        | Outliner + daily notes.                 | Web-first multi-user. MCP. Semantic search. Postgres not SQLite.          |
| **Trilium**       | Scripting, attributes.                  | Multi-user. Agent-first via MCP. Semantic search.                         |
| **SilverBullet**  | Lua plugins.                            | Rich-text. Backlinks graph. MCP.                                          |
| **HedgeDoc**      | Real-time collab.                       | Private notebook (not collab-oriented). Agent interface. Semantic.        |
| **Notesnook**     | E2EE.                                   | Open, self-host web, agent interface. Different thesis.                   |

The differentiation is **not** "more features than Joplin" — it's that every feature is reachable both by a human *and* by an agent via the same API, and the whole thing fits in a `docker compose up`.

---

## Who It's For

Three distinct users:

1. **The self-hoster who wants their notes to work with AI** — runs a server (`docker compose up`), points Claude Desktop or Cursor at the MCP endpoint, and now their entire note corpus is searchable by meaning, tag-aware, and writable by an agent. Values: control, privacy, portability, agent-first ergonomics.
2. **Small teams on shared infrastructure** — households, clubs, study groups, homelab shops. Each person has an account on the same deployment; nothing is shared between accounts in v1.
3. **Contributors** — developers who can read a small, well-organised Next.js codebase and extend it without negotiating with a framework. The entire app is ~8K LOC outside node_modules.

The product is **not for**: organisations that need collaboration, compliance features, SSO, audit logs, or an account-management UI for admins. Those needs are legitimate — they are a different product.

---

## Positioning

| Axis                  | Where Strawberry Notes sits                                                              |
| --------------------- | ---------------------------------------------------------------------------------------- |
| Hosting               | **Self-hosted.** No SaaS. No telemetry.                                                  |
| Data ownership        | **Operator-owned.** Postgres + one volume. Backups are `pg_dump` + `tar`, or one-shot ZIP. |
| Collaboration         | **None.** Multi-user ≠ shared notes. Single-user-per-account is the model.               |
| Formatting            | **Rich-text editor** with Markdown as transport. `[[wiki-links]]` + backlinks graph.     |
| Search                | **Keyword (Postgres FTS) + semantic (pgvector + embeddings).**                           |
| Agent interface       | **First-class MCP.** Same operations as REST; tokens scoped per user.                    |
| Mobile                | **PWA.** No native apps, no plans for them.                                              |
| Browser integration   | **MV3 web clipper** (Chrome + Firefox) posts via personal access token.                  |
| Backup / portability  | **Full workspace ZIP** endpoint + per-note Markdown export.                              |
| Complexity posture    | **Deliberately small.** Non-bloat is a feature; see [roadmap.md](roadmap.md).            |

---

## Licensing

MIT. The license file is at the repo root. Contributions are accepted under the same licence; see [CONTRIBUTING.md](../../CONTRIBUTING.md).

---

## Status

- **Version:** v1.2 (semantic + clipper + export-all + backlinks shipped 2026-04-23/24). v1.1 was MCP + personal access tokens. v1 was the notebook core.
- **Production readiness:** ready for personal and small-team deployments. Not hardened for adversarial multi-tenancy (i.e. don't offer accounts to strangers without additional process).
- **Support:** best-effort via GitHub issues.

---

## Sustainability Model

The project is written to be *maintained by one person in a weekend per quarter*:

- No build-step churn (Next.js + standalone output is stable).
- No SaaS dependencies. Every integration (embeddings, MCP clients, proxy) is something the operator owns or can swap.
- Small enough that one engineer can hold it in their head — root `lib/` + `app/api/` is well under 10K lines.
- Drizzle + Postgres, not an exotic ORM; pgvector is a single Postgres extension, not a separate service.
- Inline styles, not a design-system dep to version-lock.

If the codebase ever grows beyond what one careful reader can comprehend, that is a regression, not a feature. See the "non-bloat line" in [roadmap.md](roadmap.md).
