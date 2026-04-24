# Tech Stack

[← Leadership TOC](README.md)

What's in the box, why it's there, and what maintenance looks like.

---

## The Stack

| Layer                  | Choice                                             | Rationale                                                                                                     |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Framework              | **Next.js 16** (App Router, standalone)            | One process for frontend + backend. Standalone output → trivial Docker image. Well-documented, well-staffed.   |
| Language               | TypeScript (strict)                                | Cheap insurance on a small codebase; near-zero cost given Next's defaults.                                    |
| UI                     | React 19                                           | Required by Next 16. Nothing exotic on top.                                                                   |
| Editor                 | **TipTap 3** (ProseMirror)                         | Stable, modular. ProseMirror JSON is durable. Inline-decoration plugin adds wiki-link chips with no schema change. |
| Database               | **Postgres 16 + pgvector 0.8**                     | Proven, free, one process to run. JSONB holds ProseMirror docs; tsvector does FTS; `vector(N)` does ANN. One DB, three query modes. |
| ORM                    | **Drizzle**                                        | Lightweight, migration-first, TypeScript-native. Stays out of the way.                                        |
| Auth                   | **Auth.js v5** (credentials + JWT) + personal access tokens (SHA-256) | No external IdP needed. Cookie JWT for browser; bearer tokens for MCP/extension.                              |
| Agent interface        | **`@modelcontextprotocol/sdk`** at `/api/mcp`      | Stateless streamable HTTP; every REST operation reflected as an MCP tool.                                     |
| Embeddings             | OpenAI-compatible `/v1/embeddings` over `fetch`    | No SDK dep. Works against OpenAI, Ollama, llama.cpp, vLLM, LM Studio. Env-configured, gracefully optional.    |
| Server state (FE)      | TanStack Query 5                                   | Industry standard. Handles caching, invalidation, optimistic updates.                                         |
| UI state               | Zustand 5                                          | ~1 KB. Fits the scope; no Redux ceremony.                                                                     |
| Validation             | Zod 4                                              | Request validation where it matters; no global boilerplate.                                                   |
| Markdown round-trip    | marked + turndown                                  | marked for import (md → AST → PM JSON); turndown for HTML → md inside the web clipper.                         |
| ZIP export             | `lib/zip/streaming.ts` (in-house, ~230 LOC)        | Zero-dep streaming PKZIP writer atop Node's `zlib.deflateRaw` + a CRC-32 table. Bounded memory at any workspace size. |
| Offline                | Vanilla service worker + Dexie (installed, reserved for v1.3 write queue) | Read-only SWR shipped; write queue plumbing reserved.                                                         |
| Browser extension      | MV3 (Chrome + Firefox + Safari-compatible) in `extension/` | Self-contained subdir with own esbuild. No root-level dep pollution.                                          |
| Tests                  | Vitest + Testing Library                           | Fast enough to leave in watch mode. 148+ tests covering scanner, embedder, zip writer, backlinks service, CORS helper. |
| Container              | Multi-stage Dockerfile + tini                      | Small image. Non-root user. Postgres wait + migrate in entrypoint.                                            |

No SaaS dependencies. No telemetry. No external CDN. No OAuth provider. No Redis. No dedicated workers. No queue. No CMS. Embeddings are optional and go directly to whatever endpoint the operator chooses.

---

## Why Not X?

Short answers to the questions operators usually ask:

- **Why not SQLite?** FTS in Postgres is mature (`tsvector`, `websearch_to_tsquery`), and pgvector makes Postgres *one* store for keyword + semantic + relational. SQLite + a separate vector store doubles the ops burden.
- **Why not Prisma?** Drizzle has a smaller runtime, no code-gen step, and migrations are plain SQL you can read. Prisma is also fine; Drizzle fit the "stays out of the way" brief better.
- **Why not Tailwind?** The styled surface is small enough that inline style objects + CSS custom properties for theming is simpler than any utility framework. No build plugin, no `content` config to break.
- **Why not a design system (MUI, Chakra, shadcn)?** Same reason. One less major-version upgrade to track. The icon set is hand-rolled SVG and is cheap to maintain.
- **Why not Remix / SvelteKit / SolidStart?** Next.js has the largest documentation surface and the most plausible five-year maintenance story for a self-hosted app.
- **Why not server actions?** REST over `fetch` is perfectly fine at this size, and it makes the backend trivially callable from any client (MCP, web clipper, CLI, future integrations). Server actions are a framework lock-in we didn't need.
- **Why not the OpenAI SDK?** One `fetch` call. The SDK brings a dependency graph, retry logic we'd override anyway, and migration risk we don't need.
- **Why not an external vector DB (Pinecone, Weaviate, Qdrant)?** pgvector + IVFFlat covers small-to-mid self-host scale (10K–100K notes per user) in one process. An external DB means another container, another auth boundary, another failure mode.
- **Why not a plugin system (Obsidian-style)?** The web clipper is a *consumer* of the existing API via a personal access token. Same for the MCP clients. That's the plugin model — externalise, don't embed.
- **Why no OAuth?** Every OAuth provider is a new failure mode for a self-hoster. Credentials + a strong password covers the users we're optimising for.

---

## Vendor & Maintenance Risk

| Dependency         | Risk                                                                                                 | Mitigation                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Next.js            | Major versions bring breaking changes.                                                               | Standalone output is stable across majors; pin to known-good, upgrade deliberately.  |
| Auth.js            | Currently on `5.0.0-beta.x`. Beta API.                                                               | Config surface used is small. Lift-and-shift to the stable API when it lands.        |
| TipTap             | Extensions churn between majors.                                                                     | Only core extensions + one in-house inline-decoration plugin used; PM JSON is stable. |
| Postgres + pgvector| None material; pgvector is a single extension on a stable Postgres.                                  | Extension is MIT-licensed; Postgres 16 is supported through 2028.                    |
| Embeddings provider| Operator chooses; OpenAI has rate limits, self-hosted providers have setup cost.                     | Provider-agnostic OpenAI-compatible shape; app runs fine when unset.                 |
| Node 20            | LTS until 2026-04.                                                                                   | Bump to Node 22 LTS in the `Dockerfile` before EOL.                                  |
| MCP SDK            | Spec still pre-1.0; occasional API tweaks.                                                           | Thin usage (one server, one transport); spec changes touch `lib/mcp/server.ts` only. |

---

## Upgrade Posture

- **Patch releases:** apply eagerly (security).
- **Minor releases:** apply in a maintenance window with a smoke test.
- **Major releases:** read the changelog, do it on a branch, round-trip the markdown tests, ship behind a staging deployment first.

The lockfile is committed (`package-lock.json`) — reproducible installs are required.

---

## Security Surface

See [../technical/auth.md](../technical/auth.md) and [../../SECURITY.md](../../SECURITY.md) for detail.

- Passwords hashed with bcrypt (cost 10).
- All API routes check ownership (`requireUserId()` / `requireUserIdForApi()` + user-scoped WHERE).
- Personal access tokens: 32 random bytes, `snb_` prefix, SHA-256 at rest, shown once, revocable.
- CORS on extension-facing routes (`/api/folders`, `/api/notes/import`) is restricted to `chrome-extension://` / `moz-extension://` / `safari-web-extension://` — the bearer token is the access gate, origin allowlisting is defence in depth.
- Folder ownership is checked on note insert so a bearer request cannot plant a note in another user's folder.
- Uploads: MIME-whitelisted, size-capped, ownership-checked on every GET; orphan sweep has a 5-minute grace to protect in-flight uploads, and path-containment refuses any resolved path outside `UPLOAD_DIR`.
- TLS is delegated to a reverse proxy (Caddy / nginx / Cloudflare). The app never terminates TLS itself.
- No telemetry; no third-party JS loads in the browser. Embeddings requests go to the operator-configured endpoint only — nothing else leaves the box.
- Formal pentesting: not performed. Responsible disclosure policy in SECURITY.md.
