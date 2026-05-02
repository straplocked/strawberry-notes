# Documentation Changelog

> Per-run entries from the doc-refresh procedure defined in [DOC_UPDATE.md](../DOC_UPDATE.md).
> Newest entries go on top.

---

## Run 7 — 2026-05-02

**Summary:** v1.5 — **Private Notes** documentation pass. The crypto envelope, threat model, and recovery semantics for the per-note opt-in E2EE feature shipped over PRs #50, #54, #55. This pass adds the canonical `docs/technical/private-notes.md`, rewrites the roadmap E2EE non-goal entry into a "full-workspace E2EE" non-goal + a v1.5 section above it, adds a "Database at rest" section to deployment docs (LUKS / cloud volume encryption / encrypted backups), and threads the visibility note through every neighbouring doc that mentions agents, the clipper, the embedding worker, or the FTS index. Doc-only — no code changes in this run.

**Files modified:**

- `docs/technical/private-notes.md` — **new file** (~140 lines). Covers the WebCrypto envelope (PBKDF2-SHA256 @ 600 000 iters → AES-256-GCM, 32-byte NMK wrapped twice with passphrase + recovery KEKs, `sn-private-notes-v1` AAD), the per-note ciphertext layout, the wrap envelope JSON shape, the full threat model (defends LLM exfil via MCP / casual operator inspection / plaintext FTS / plaintext backups / clipper reads; does NOT defend rogue server bundle / debugger-on-unlocked-tab / DB+passphrase-or-recovery), recovery semantics (lose-both is unrecoverable, by design), the "what's hidden from whom" matrix, and an implementation map cross-linking every relevant code file.
- `docs/technical/README.md` — added `private-notes.md` to the technical TOC table.
- `docs/technical/mcp.md` — Security Notes section gains an explicit "Private Notes are invisible to MCP" bullet describing the `includePrivate: false` contract across `list_notes` / `search_notes` / `search_semantic` / `get_note` / `get_backlinks` / `export_note_markdown`.
- `docs/technical/extension.md` — Security considerations section gains the same invisibility note for the web clipper, with the nuance that the clipper is write-only in practice.
- `docs/technical/webhooks.md` — `note.linked` description gains a clarifying sentence: private notes can never be link sources because server-side wiki-link extraction is skipped; plaintext-→-private-target resolves and fires normally.
- `docs/technical/database.md` — `notes.encryption` jsonb? column added to the `notes` table reference with a description of the envelope shape and the forced-empty rule for derived columns. New `notes_encryption_idx` partial index documented. New `user_encryption` table section between `webhooks` and the Relations diagram, covering `passphraseWrap` / `recoveryWrap` shape and the lazy-create + DELETE-when-empty lifecycle.
- `docs/technical/deployment.md` — new **Encrypted backups** subsection under Backups with the `pg_dump | gpg --symmetric` recipe. New top-level **Database at rest** section after Backups: framing (orthogonal to Private Notes), LUKS recipe with `cryptsetup`, cloud-volume table covering AWS EBS / GCP CSEK / DigitalOcean / Hetzner / Synology / Unraid, "what it doesn't defend against" callout, and the LUKS-with-passphrase-at-boot escape hatch. Deployment doc grew from 400 → ~470 lines; near the split threshold but kept as one file (still the single coherent operator-facing reference).
- `docs/leadership/roadmap.md` — Explicit Non-Goals entry "End-to-end encryption" rewritten as "Full-workspace E2EE by default" with a forward link to v1.5. New `## v1.5 — Private Notes (shipped 2026-05-02)` section between v1.4 Tier 2 and the Non-Goals header, covering what shipped (per-note opt-in / crypto envelope / recovery model / MCP+clipper invisibility / Settings panel / workspace export / operator at-rest guidance) plus the non-bloat budget (zero new runtime deps, one table, one column, one lib module, one Settings panel, one new doc).
- `docs/user/features.md` — new **Private Notes** section after **Connecting an AI assistant (MCP)**, with a one-line forward reference at the bottom of the MCP section. Covers one-time setup, marking a note private, unlocking, reverting to plaintext, and the four important warnings (lose-both = lose the bodies; titles/folders/tags stay visible; no search inside private notes; no wiki-links from private notes).
- `docs/user/getting-started.md` — added a "mark sensitive notes Private" bullet to step 5 (Organise as you go) with a forward link to the features section.
- `docs/README.md` — added Private Notes row to the Quick Links table.
- `DOC_UPDATE.md` — Run counter 6 → 7; last-run date 2026-05-02.

---

## Run 6 — 2026-04-28

**Summary:** v1.3 Tier 4 — deploy-hardening. The pre-Unraid pass: a public `/api/health` endpoint, an `app`-service compose `healthcheck`, an Unraid deployment subsection, and a wording fix on the embedding-worker replica-safety claim. v1.3 is now closed; the roadmap header flips from "in progress" to "shipped 2026-04-28". One small code change (the route + its unit test); the rest is doc edits.

**Files modified:**

- `app/api/health/route.ts` — **new file**. Public, unauthenticated, non-rate-limited GET. 1-second-bounded `SELECT 1` via `Promise.race`; 200 + `{ ok: true, db: 'up' }` on success, 503 + `{ ok: false, db: 'down', error }` on failure. `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`. Surfaces no secrets.
- `app/api/health/route.test.ts` — **new file**. Three Vitest cases mocking `@/lib/db/client`: success path, rejected ping, timed-out ping. No real DB.
- `docker-compose.yml` — `app` service gains a `healthcheck` calling `/api/health` via `node -e "fetch(...)"` (alpine has no curl). Interval 30 s, timeout 5 s, retries 5, start period 30 s. `docker compose ps` now reflects real readiness.
- `docs/leadership/roadmap.md` — heading flipped to "v1.3 — Public-launch hardening (shipped 2026-04-28)"; stale `.claude/plans/...` reference replaced with "Tracked in this section". New **Tier 4 — landed** subsection covering the health endpoint, the compose healthcheck, and the Unraid notes, with non-bloat justification.
- `docs/technical/deployment.md` — new **Health endpoint** subsection under **Public-launch hardening** with the curl example. New **Unraid** section after **Reverse Proxy** covering UID 1001 ownership of host bind mounts under `/mnt/user/appdata/strawberry-notes/{uploads,pgdata}`, the four-field Community-Applications-style env table, the `EMBEDDING_ENDPOINT=http://<lan-ip>:11434/v1` recipe for an Ollama sibling container, and a pointer to use `/api/health` as the Unraid template's WebUI URL for the dashboard's status dot.
- `docs/technical/database.md` — corrected the **Semantic Search** "safe under N replicas" line. The `SKIP LOCKED` lock releases when the SELECT autocommits, *before* the embed HTTP call, so two replicas can re-embed the same row (vectors converge but the API budget doubles). Recommend single-replica + out-of-band `npm run db:embed` for multi-replica setups. Cross-linked `deployment.md`'s single-replica callout.
- `DOC_UPDATE.md` — Run counter 5 → 6; last-run date 2026-04-28.

**Files added:** `app/api/health/route.ts`, `app/api/health/route.test.ts`.

**Notes:**

- One real code change in this run (the `/api/health` endpoint and its compose probe) — the rest is doc work tracking the same shipment. Treated as Run 6 because the roadmap header, deployment doc, and database doc all needed propagating updates that would otherwise drift.
- All modified docs remain under the 250-line threshold; `deployment.md` is now ~245 lines (was ~200), still well under the 400-line split threshold.
- The embedding-worker replica caveat is now documented in three coherent places: `lib/embeddings/worker.ts` inline, `database.md` Semantic Search, and `deployment.md` Single-replica callout. They say the same thing.
- The Unraid section deliberately keeps the LinuxServer.io PUID/PGID convention out of scope. The image is non-root by build, and chowning host paths to 1001:1001 once is simpler than a privileged entrypoint that demotes itself. If a future user needs runtime UID flexibility, the Dockerfile would gain `ARG UID/GID` build args — call it out as a v1.3+ candidate, not a v1.3 ship-blocker.

---

## Run 5 — 2026-04-27

**Summary:** Sync the docs to v1.3 Tier 3 + the sidebar craft pass. Three product-shaped changes drove most of the diff: nested folders (`folders.parent_id` + tree UI), tag rename / merge / delete UI in Settings, and a `pg_trgm` index speeding the `[[`-autocomplete substring scan. A follow-up craft pass turned hover legibility from "stack of small defaults" into a coherent rest → hover → active progression and made the folder dot a clickable colour picker. The leadership/roadmap.md was already updated in the implementation PR (#22) — this run propagates the changes to every other affected doc.

**Files modified:**

- `docs/technical/database.md` — `folders.parentId` self-FK + `folders_parent_idx`; nested-folder cycle-prevention note. New `note_links` table section. `notes` table gains explicit rows for `snippet`, `hasImage`, `contentEmbedding`, `embeddingStale` (previously buried in a sub-table). New `notes_title_trgm_idx`, `notes_user_trashed_idx` rows in the index list. Migration list extended through `0007_nested_folders.sql`; `0004_embeddings.sql` corrected to `0005`. Relations diagram gains the self-FK and `note_links` edge. Lifecycle notes rewritten for tag delete-vs-merge and folder cascade-of-subtree behaviour.
- `docs/technical/api-reference.md` — `POST /api/folders` body gains `parentId`. `PATCH /api/folders/:id` documents `parentId` reparenting + `parent-cycle` error. `DELETE /api/folders/:id` updated to mention subtree cascade. New **`PATCH /api/tags/:id`** (rename + merge with `{ id, merged }` response) and **`DELETE /api/tags/:id`** sections. `GET /api/notes/titles` description updated to reference the trigram index instead of the open-todo. DTO Shapes gains a "v1.3" subsection for `FolderDTO.parentId` and the tag-patch response shape.
- `docs/technical/mcp.md` — Tool reference table gains `update_folder`, `rename_tag`, `delete_tag`. `create_folder` row updated for the new `parentId` parameter. `list_folders` row notes that the response now carries `parentId` for tree reconstruction.
- `docs/technical/frontend.md` — Component map line counts refreshed (Sidebar.tsx ~880, Editor.tsx ~700, AppShell.tsx ~620 — all grew significantly). Roles updated: Sidebar describes the nested-folder tree, hover actions, drop zones, and colour picker; AppShell describes the mobile pane state machine and folder-colour-change handler. New `components/app/settings/` sub-table covering `TokensSection`, `TagsSection`, `McpClientsSection`. Hooks list expanded with the time-range, counts, titles, backlinks queries and the new `usePatchTag` / `useDeleteTag` mutations; `useDeleteFolder` cascade-aware optimistic update called out. Styling section now documents the `sn-*` class system in `globals.css` for state-dependent paint that inline styles can't express.
- `docs/technical/architecture.md` — Routing table updated end-to-end: added `/settings` page; added `/api/notes/counts`, `/api/notes/titles`, `/api/notes/search/semantic`, `/api/notes/[id]/backlinks`, `/api/export/all.zip`, `/api/tags/[id]`, `/api/attachments/gc`, `/api/tokens`, `/api/tokens/[id]`, `/api/mcp`. The signup row now mentions the env gate.
- `docs/user/features.md` — Folders section rewritten for nested folders (hover + → add sub-folder; chevron collapse/expand; coloured dot identity at top level only) and the new colour-picker affordance (six accent swatches). Tags section gains a "Rename / merge / delete" bullet pointing at Settings → Tags. MCP tool list updated with `rename_tag` / `delete_tag`.
- `DOC_UPDATE.md` — Run counter 4 → 5; last-run date 2026-04-27.

**Files added:** none — every change is an edit to existing docs.

**Notes:**

- Doc-only run; no code changed.
- All modified files remain under their split thresholds. `api-reference.md` is now ~370 lines (was ~310) — still under the 400-line threshold but worth flagging as next in line for a split if it grows further. Natural seams would be **Auth · Notes · Folders · Tags · Uploads · Tokens · MCP**.
- The nested-folder DELETE cascades the entire subtree of folders — this is documented in three places now (database.md lifecycle notes, api-reference.md DELETE section, user features.md). Reviewers should ensure those stay aligned.
- The `usePatchFolder` / `usePatchTag` patch surface is the single source of truth for the optimistic invalidation behaviour. Hooks and api-reference are kept in lockstep deliberately — change one, the diff highlights the other.

---

## Run 4 — 2026-04-24

**Summary:** Repositioned the docs to match v1.2's class-leader shape. The notebook-core "boringly good at being a notebook" framing has been replaced with the **class-leader thesis**: *the self-hosted notebook with a first-class AI + agent interface.* All three audience tiers now surface wiki-links + backlinks, semantic search (pgvector + OpenAI-compatible embeddings), full-workspace ZIP export, attachment GC, the browser web clipper, and the expanded MCP tool set — each with non-bloat justification.

**Files added:**

- `docs/technical/extension.md` — MV3 browser web clipper: layout, Chrome + Firefox install, configure via PAT, clipping flow, server-side integration (CORS allowlist, folder ownership check, `requireUserIdForApi` auth path), security considerations, known gaps.

**Files modified:**

- `docs/leadership/overview.md` — New "Class-Leader Thesis" section with the one-sentence positioning, the five-point differentiator list, and a competitive comparison table (Joplin, Obsidian, Standard Notes, Logseq, Trilium, SilverBullet, HedgeDoc, Notesnook). Positioning table gains axes for search, agent interface, browser integration, backup/portability. Status version bumped to v1.2.
- `docs/leadership/roadmap.md` — Split history into **v1**, **v1.1 (MCP)**, and **v1.2 (AI-native pivot)** with a dedicated section per slice (wiki-links + backlinks, semantic search, export-all + GC, web clipper, UI polish) and their non-bloat justifications. Candidate list trimmed of everything now shipped; added graph view, nested folders, daily notes, trigram index follow-up, `all.zip` re-import. Non-bloat-line UI-surface rule updated to include the More menu and Settings page.
- `docs/leadership/tech-stack.md` — New rows in the stack table for pgvector, MCP SDK, in-house ZIP writer, browser extension, embeddings client. Expanded "Why not X?" to cover SQLite, external vector DBs, OpenAI SDK, plugin systems. Risk table gains pgvector, embeddings provider, MCP SDK rows. Security surface section adds token model, CORS allowlist, folder ownership check, path containment.
- `docs/leadership/README.md` — One-paragraph summary rewritten to lead with the AI-native thesis.
- `docs/technical/README.md` — Indexed `extension.md`; quick orientation updated for pgvector, in-house wiki-link plugin, embeddings, agent interface.
- `docs/technical/api-reference.md` — Added `GET /api/notes/:id/backlinks`, `GET /api/notes/titles`, `POST /api/notes/search/semantic`. Updated `POST /api/attachments/gc` to document the 5-minute grace window and path-containment check. `DTO Shapes` section gains `BacklinkDTO` and semantic-search result shape.
- `docs/technical/mcp.md` — Added `get_backlinks` row to the tool reference table.
- `docs/technical/editor.md` — Corrected the stale "~412 lines" claim. Added `WikiLinkExtension` to extensions list, `extractWikiLinks` to helpers, and a new **Wiki-Links & Backlinks** section covering the `note_links` table, resolution flow (sync / resolve-pending / unresolve-to), editor rendering (decorations + popup + click handler + `[[[` guard), how backlinks are surfaced (REST, MCP, panel), and the rationale for decoration-only vs a node/mark type.
- `docs/user/README.md` — What-is-Strawberry-Notes intro now leads with the AI-native bullets (wiki-links + backlinks, semantic search, full ZIP backup, web clipper, MCP) before the notebook core.
- `docs/user/features.md` — New sections for wiki-links (typing / backlinks / unresolved / renames), semantic search (kept graceful-fallback language), full-workspace ZIP backup, web clipper setup. Updated per-note export to mention the three-dots More menu. `[[` added to keyboard shortcuts. Kept the "what's not here" section accurate.
- `docs/README.md` — Added thesis callout; quick-link table expanded with overview, roadmap, pgvector, MCP, extension, editor, features.
- `README.md` (root) — Headline replaced with the class-leader thesis line; Why paragraph rewritten for the AI-native angle; features split into "The notebook core" + "The class-leader differentiators"; architecture list gains pgvector + embeddings + MCP + wiki-link plugin + GC; configuration table gains `EMBEDDING_*` env vars; backup section leads with the one-click ZIP export.
- `DOC_UPDATE.md` — Run counter 3 → 4; last-run date 2026-04-24.

**Notes:**

- All doc files remain under the 250-line threshold except `api-reference.md` (now ~310 lines), which gains the three new endpoint subsections but stays under the 400-line split threshold. No splits triggered.
- No code changed in this run — this is a documentation-only refresh to match the shipped v1.2 features (PRs #6–#11).
- The class-leader positioning is now explicit in six places: root `README.md` headline, `docs/README.md` thesis callout, `leadership/README.md` summary, `leadership/overview.md` "Class-Leader Thesis" section, `leadership/roadmap.md` v1.2 section, and `leadership/tech-stack.md`. A reader landing on any of these paths encounters the thesis within the first screen.

---

## Run 3 — 2026-04-21

**Summary:** Shipped the MCP server feature. Strawberry Notes now exposes its
REST surface over `POST /api/mcp` for Claude Desktop, Claude Code, Cursor, and
other MCP-compatible clients. Auth is a new personal-access-token system; a
Settings page was added to mint and revoke tokens. Route handlers were thinned
out onto a shared `lib/notes/service.ts` so REST and MCP cannot drift.

**Files added:**

- `drizzle/0002_api_tokens.sql` — `api_tokens` table.
- `lib/auth/token.ts` — token issue/hash/verify/revoke helpers (SHA-256 at rest, `snb_` prefix).
- `lib/auth/require-api.ts` — `requireUserIdForApi` (Bearer + session fallback) and `requireBearerUserId` (bearer-only).
- `lib/notes/service.ts`, `lib/notes/folder-service.ts`, `lib/notes/tag-service.ts` — shared business logic.
- `lib/mcp/server.ts` — `buildMcpServer(userId)`; 12 tools (list/search/get/create/update/delete notes, list/create folders, list tags, add/remove tags, export).
- `lib/auth/token.test.ts`, `lib/mcp/server.test.ts` — smoke tests (no DB).
- `app/api/mcp/route.ts`, `app/api/tokens/route.ts`, `app/api/tokens/[id]/route.ts`.
- `app/(app)/settings/page.tsx`, `components/app/settings/TokensSection.tsx`.
- `docs/technical/mcp.md` — feature doc (endpoint, auth, tool reference, client config examples).

**Files modified:**

- `lib/db/schema.ts` — added `apiTokens` table + `ApiToken` type.
- `app/api/notes/route.ts`, `app/api/notes/[id]/route.ts`, `app/api/folders/route.ts`, `app/api/tags/route.ts` — now thin validators delegating to the service modules. Behavior preserved.
- `components/app/Sidebar.tsx`, `components/icons/index.tsx` — gear icon linking to `/settings`.
- `docs/technical/README.md` — linked `mcp.md`.
- `docs/user/features.md` — added an "Connecting an AI assistant" section pointing at the technical doc.
- `docs/leadership/roadmap.md` — moved MCP from candidate to shipped (v1.x), with the non-bloat justification inline.
- `README.md` — one-line mention of MCP in the feature list.
- `package.json` + `package-lock.json` — added `@modelcontextprotocol/sdk`.

**Notes:**

- New docs file is well under 250 lines; no splits triggered.
- REST response shapes are unchanged. Existing React Query hooks and tests continued to pass.
- `npm run typecheck`, `npm run lint`, `npm test` (60 tests, 9 files) all clean.

---

## Run 2 — 2026-04-18

**Summary:** Added pure-unit test coverage for five previously untested modules and
refreshed `technical/testing.md` so the coverage table and gap list match reality.
No production code changed.

**Tests added (49 new cases, suite is now 57 / 7 files):**

- `lib/format.test.ts` — `formatDate` day-relative rules + calendar-diff midnight edge case.
- `lib/storage.test.ts` — MIME allowlist, `extForMime`, `maxUploadBytes` env + 1 MiB floor, `uploadsDir` override.
- `lib/design/accents.test.ts` — accent list invariants, `accentById` fallback, `DEFAULT_SETTINGS`.
- `lib/api/client.test.ts` — REST URL / method / body shape, `notes.list` filter omission, non-ok error formatting.
- `lib/store/ui-store.test.ts` — Zustand defaults, view/search reset, settings persistence, theme-aware CSS vars, `hydrateSettingsFromStorage` (empty / garbage / partial).

**Files modified:**

- `docs/technical/testing.md` — expanded coverage table, tightened gap list (upload helpers now covered at the pure-function layer).

**Notes:**

- All new tests are pure (no DB, no Next.js server runtime). `fetch` is stubbed for the API client suite; jsdom provides `localStorage` + `document` for the store suite.
- No doc files were split — `testing.md` is still well below the 250-line threshold.

---

## Run 1 — 2026-04-18

**Summary:** Initial creation of the documentation tree. Scanned the codebase end-to-end
(v1 application per commit `29d3d5e` plus Docker fixes in `e6c8f22` / `f7cd7e4`) and
wrote first-edition docs for all three audiences.

**Files added:**

- `DOC_UPDATE.md` (root) — refresh playbook with run counter.
- `CLAUDE.md` (root) — instructs future Claude sessions to scan docs at start.
- `docs/README.md` — master index.
- `docs/CHANGELOG.md` — this file.
- `docs/technical/README.md` — technical TOC.
- `docs/technical/architecture.md` — system overview, rendering model, data flow.
- `docs/technical/database.md` — Drizzle schema, indexes, migrations, FTS setup.
- `docs/technical/api-reference.md` — REST endpoints, auth rules, request/response shapes.
- `docs/technical/auth.md` — Auth.js v5 config, session strategy, protection model.
- `docs/technical/editor.md` — TipTap setup, content storage, markdown round-trip.
- `docs/technical/uploads.md` — local storage, MIME whitelist, ownership checks.
- `docs/technical/frontend.md` — component map, state model, styling approach.
- `docs/technical/testing.md` — Vitest setup, current coverage, gaps.
- `docs/technical/deployment.md` — Docker, env vars, reverse proxy, backups.
- `docs/user/README.md` — user TOC.
- `docs/user/getting-started.md` — sign up, first note, orientation.
- `docs/user/features.md` — folders, tags, pinning, search, export, PWA.
- `docs/user/troubleshooting.md` — common issues + fixes.
- `docs/leadership/README.md` — leadership TOC.
- `docs/leadership/overview.md` — what the product is, positioning, scope.
- `docs/leadership/tech-stack.md` — stack rationale, vendor risk, upgrade posture.
- `docs/leadership/roadmap.md` — v1 surface, explicit non-goals, candidate next steps.

**Files modified:**

- None (initial run).

**Notes:**

- No file in the initial set exceeded the 400-line large-file threshold; no splits were required.
- `components/app/Editor.tsx` (412 lines) is the only source file over threshold, but the split
  strategy governs **docs**, not code. Flagged here for future code-refactor judgment.
