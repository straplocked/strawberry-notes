# Technical Documentation

Audience: engineers extending, operating, or reviewing Strawberry Notes.

| File                                       | Topic                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------- |
| [architecture.md](architecture.md)         | System overview, routing model, request lifecycle, state layering.    |
| [database.md](database.md)                 | Drizzle schema, indexes, migrations, full-text search.                |
| [api-reference.md](api-reference.md)       | REST endpoints: methods, auth, request/response shapes.               |
| [auth.md](auth.md)                         | Auth.js v5 config, JWT session, protection model, signup flow.        |
| [editor.md](editor.md)                     | TipTap setup, content storage, markdown round-trip.                   |
| [uploads.md](uploads.md)                   | Local storage layout, validation, serving, ownership checks.          |
| [frontend.md](frontend.md)                 | Component map, state model, styling/theming approach.                 |
| [testing.md](testing.md)                   | Vitest setup, existing coverage, gaps.                                |
| [deployment.md](deployment.md)             | Docker build, env vars, reverse proxy, backup/restore.                |
| [mcp.md](mcp.md)                           | MCP server at `/api/mcp`, personal access tokens, tool reference.     |

---

## Quick Orientation

- **Framework:** Next.js 16 App Router, standalone output.
- **Language:** TypeScript, strict mode, `@/*` path alias at project root.
- **DB:** Postgres 16 via Drizzle ORM.
- **Auth:** Auth.js v5 (credentials provider), JWT sessions.
- **Editor:** TipTap 3 (ProseMirror).
- **State:** React Query (server) + Zustand (UI).
- **Host port:** `3200` (the container listens on `3000`; compose publishes `3200:3000`).
- **Data volume:** `/data/uploads` inside the container.
