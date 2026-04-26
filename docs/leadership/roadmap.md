# Roadmap

[← Leadership TOC](README.md)

What shipped in v1 / v1.1 / v1.2, what we are explicitly **not** building, and what a plausible v1.3+ could look like. The non-bloat line is load-bearing — read the last section before proposing work.

---

## v1 — Shipped (2026-04-17/18)

Feature surface delivered by the v1 build:

- Multi-user accounts (credentials auth, bcrypt, JWT sessions).
- Three-pane notes UI (sidebar / list / editor).
- Rich-text editor: headings, lists, checklists, blockquotes, dividers, images, marks.
- Folders (with colour + position).
- Tags (per-user, auto-upsert, counts).
- Pinning, soft-delete (Trash), hard-delete.
- Full-text search (Postgres tsvector + websearch) with ILIKE fallback.
- Markdown export per note (`GET /api/notes/:id/export.md`).
- Markdown import (`POST /api/notes/import`, multi-file).
- Image uploads: PNG/JPEG/WebP/GIF/SVG/AVIF, size-capped, ownership-checked.
- PWA install + read-only service-worker offline (SWR for lists, network-first for navigations).
- Theming: dark/light, six accent palettes, three density levels, sidebar toggle.
- Docker deployment: multi-stage build, entrypoint with `wait-for-postgres` + `drizzle-kit migrate`, named volumes, host port 3200.

---

## v1.1 — MCP server (2026-04-21)

- **MCP endpoint** at `POST /api/mcp` (stateless Streamable HTTP, JSON-RPC). Lets Claude Desktop, Claude Code, Cursor, and other MCP clients read/search/create/update/tag/export the signed-in user's notes.
- **Personal access tokens** — new `api_tokens` table, `Settings → Personal Access Tokens` UI to mint/revoke; SHA-256 at rest, shown to the operator once.
- **Shared notes/folder/tag services** (`lib/notes/service.ts`, `lib/notes/folder-service.ts`, `lib/notes/tag-service.ts`) — REST handlers and MCP tools call the same functions so they cannot drift.

Non-bloat justification: this was the existing REST surface re-exposed via a different transport — no new product surface, no plugin model, and zero operator cost until the first token is minted. See [../technical/mcp.md](../technical/mcp.md).

---

## v1.2 — The AI-native pivot (2026-04-23/24)

Five slices shipped in parallel, coordinating on one migration serialisation point. This is the slate that earns the class-leader claim in [overview.md](overview.md).

### Wiki-links + backlinks (PRs #6 + #7)

- `note_links` table (migration `0004`) — `source_id → target_id` with `target_title` kept for unresolved links; case-insensitive matching; unresolved rows auto-bind when a matching note is later created, and a title rename unresolves stale targets.
- `extractWikiLinks` scanner walks the ProseMirror JSON for `[[Title]]` tokens and populates `note_links` transactionally on every save.
- `GET /api/notes/:id/backlinks` + MCP `get_backlinks` tool.
- Editor: TipTap inline decorations render `[[Title]]` as berry-accent chips without changing the doc schema; an input-rule autocomplete popup appears on `[[`, fed by a lightweight `GET /api/notes/titles` endpoint; clicking a chip switches the active note.
- `<BacklinksPanel>` under each editor shows "Linked from N" with click-to-open rows.

Non-bloat: zero new npm deps; one route, one extension, one panel. Chips are decoration-only, so Markdown export still round-trips `[[Title]]` literally.

### Semantic search — pgvector + embeddings + MCP (PR #10)

- Migration `0005` enables the `vector` extension, adds `content_embedding vector(1024)` + `embedding_stale` to `notes`, and builds an IVFFlat cosine ANN index.
- `docker-compose.yml` switched to `pgvector/pgvector:pg16`.
- `lib/embeddings/client.ts` speaks the OpenAI `/v1/embeddings` shape over `fetch` — no SDK dep. Works against OpenAI, Ollama, llama.cpp, vLLM, LM Studio, or any compatible endpoint.
- `lib/embeddings/worker.ts` — lazy in-process worker batches stale rows; fire-and-forget from `createNote`/`updateNote`. Single-replica deployment model; `SKIP LOCKED` is a hint, not a cross-replica guarantee (documented honestly in the file).
- `POST /api/notes/search/semantic` (session or bearer) + MCP `search_semantic` tool with a description that routes agents between FTS and concept search.
- `scripts/embed-backfill.ts` + `npm run db:embed` for existing corpora.
- Graceful degradation: unset env = app runs fine, semantic endpoint returns "not configured".

Non-bloat: no runtime deps added; pgvector is a single Postgres extension; worker lives in-process so there's no new queue/service to run.

### Full-workspace ZIP export + attachment GC (PR #8)

- `GET /api/export/all.zip[?includeTrash=1]` streams a zip of `notes/<folder>/<title>-<shortId>.md` (with YAML frontmatter) + `uploads/<filename>` + a `manifest.json` for symmetric future re-import.
- `POST /api/attachments/gc` — on-demand orphan cleanup with a 5-minute grace window (so a freshly uploaded-but-not-yet-saved image survives the next sweep). Hard-delete of a note also purges its files.
- Zero-dep streaming ZIP writer at `lib/zip/streaming.ts` — `zlib.deflateRaw` + a 256-entry CRC-32 table, classic PKZIP layout; bounded memory at any workspace size.

Non-bloat: no new deps; one hand-rolled file (~230 lines) replaces an archiver dep. Two routes, both additive.

### Web clipper browser extension (PR #9)

- Self-contained MV3 extension in `extension/` (Chrome + Firefox).
- Popup UI: server URL, personal access token (stored in `chrome.storage.local`), folder dropdown, tag input, Clip page / Clip selection. Background worker + content script.
- Bundled `turndown` converts `<article>`/`<main>`/`<body>` HTML to Markdown.
- Posts to `/api/notes/import` (now JSON-capable) with `{ markdown, title?, folderId?, tagNames?, sourceUrl? }`.
- CORS is restricted to `chrome-extension://` / `moz-extension://` / `safari-web-extension://` — bearer token is the access gate; origin allowlist keeps third-party pages from reading responses.
- Folder ownership is checked on every insert — a bearer-authenticated request cannot plant a note in another user's folder.

Non-bloat: the extension lives in its own directory with its own build chain; zero runtime deps added to the root. Server changes are two routes gaining `OPTIONS` + bearer acceptance.

### UI polish (PR #11)

- The editor's three-dots "More" button now opens an ActionSheet with **Export this note as Markdown** and **Export all notes as ZIP**.

---

## v1.3 — Public-launch hardening (in progress)

The pre-launch checklist that turns a v1.2 private deployment into a v1.3 public-deployment-ready release. Tracked in [.claude/plans/what-features-should-we-nifty-grove.md](../../.claude/plans/what-features-should-we-nifty-grove.md).

- `.env.example` at the repo root documenting every supported variable (the README references it; previously missing).
- **Open-signup gate.** New `ALLOW_PUBLIC_SIGNUP` env (default `false`). Closed instances 404 the `/signup` page and `POST /api/auth/signup`. Operators provision via `npm run user:create`.
- **Operator CLIs.** `npm run user:create` and `npm run user:reset` (with shared `lib/auth/user-admin.ts` helpers) replace the previous "edit `users.passwordHash` by hand" recovery path.
- **Per-IP / per-user rate limits.** In-process token-bucket limiter (`lib/http/rate-limit.ts`) protects `POST /api/auth/signup` (5/IP/hr), the credentials sign-in callback (10/IP/min), and `POST /api/tokens` (20/user/hr). 429 + `Retry-After` on denial. Single-process scope; operators running multiple replicas should layer an upstream limiter at the proxy.
- **Public-facing README** with a head-to-head comparison table, an explicit maintainer-commitment paragraph, and operator-command index.
- **Signup, user-admin, rate-limit, and signup-policy** all unit-tested.

Non-bloat justification: zero new runtime deps; one new lib module (`rate-limit.ts`), one new lib module (`user-admin.ts`), two CLI shells in `scripts/`, one env knob, and a 404 branch in two existing routes. Default behaviour with zero config is now *more conservative*, not less.

---

See [../../CHANGELOG.md](../CHANGELOG.md) for per-doc-refresh history; `git log` for per-code-change history.

---

## Explicit Non-Goals

These are **not** coming. Saying no keeps the product small.

- **Shared notes / collaboration / real-time co-editing.** Would require CRDTs (Yjs) or OT, plus a permission model, plus a sharing UI. Out of scope — different product.
- **Organisations / tenants / role-based access control.** The single-user-per-account model is the whole point.
- **SSO / OAuth / SAML.** Self-hosters who need SSO deploy behind an identity-aware proxy (Authelia, Pomerium, Cloudflare Zero Trust). The app doesn't need to know.
- **End-to-end encryption.** Postgres sees plaintext. Users who need E2EE are better served by a product that's E2EE from the ground up.
- **Native mobile apps.** PWA install is the mobile story.
- **Plugin system / extension API.** The web clipper is a *consumer* of the existing API, not a plugin surface. Adding a plugin model would double the surface for marginal benefit.
- **Telemetry / analytics / crash reporting.** The code doesn't phone home and won't.
- **A hosted SaaS.** The license permits anyone to run one; the project itself won't.

If one of these turns out to be the right call later, it becomes a **new product** or a **fork**, not a v2.

---

## Candidates for v1.3+ (none committed)

Compatible with the non-bloat line. Ordered by leverage per unit of code.

- **Offline write queue.** Dexie is already installed. Queue edits in IndexedDB while offline and flush on reconnect. Main risk: conflict resolution. Mitigation: last-write-wins at document granularity, same as today.
- **Email-based password reset (self-service).** The v1.3 hardening ships an operator-driven CLI (`npm run user:reset`); a self-service flow would still need SMTP config — kept out of v1.3 to avoid the operator burden.
- **Graph view.** Backlinks already feed a graph — the hard part is layout. Use D3-force or similar client-side only; no server change needed.
- **Nested folders.** Schema already has `folderId: uuid | null`; nesting adds a `parentId` on `folders`. Tree UI is the hard part.
- **Daily notes / journal templates.** Small editor extension + a "New daily note" affordance keyed to today's date.
- **Attachments beyond images.** PDFs, text files, etc. Requires magic-byte sniffing in the upload endpoint (see [../technical/uploads.md](../technical/uploads.md)).
- **Tag autocomplete / rename UI.** Tags are already modeled; needs UI.
- **Trigram index on `notes.title`.** Cheap follow-up to the `[[` autocomplete endpoint — use `pg_trgm` GIN for thousands-of-notes vaults. Currently capped by `LIMIT 20`.
- **`all.zip` re-import.** Closes the symmetric-backup loop; manifest schema is already stable.
- **Per-user embedding model choice.** Let users pick between short-context and long-context embedding models when the operator has more than one configured.

The selection rule is: **does this make the product meaningfully better for the self-hoster or for the agent interface without adding a new external dependency or doubling the codebase?** If not, it stays in this list.

---

## The Non-Bloat Line

From `CONTRIBUTING.md`, reiterated here because it's easy to forget:

> Non-bloat: self-hostable first, stable tech, design files as spec.

Practical interpretation for future work:

1. **Every new dependency** must be justified against the one-engineer-weekend-per-quarter maintenance budget.
2. **Every new route** should be callable from an authenticated `curl` without special headers — the REST surface is the interface contract. The MCP tool set is a reflection of the REST surface, not a parallel surface.
3. **Every new config knob** costs operator cognition. Default behaviour must be sensible with zero config.
4. **Every new UI surface** should fit in the existing three-pane layout, the tweaks panel, the editor's More menu, or the Settings page. If it demands a fifth place, question whether the feature earns it.
5. **If a change doubles the file count of any single directory**, that's a signal to split it into a submodule or to reconsider the feature.

Keep the product small, the stack boring, and the code legible. Class-leader does not mean feature-laden — it means the features that ship pay their way and compose cleanly.
