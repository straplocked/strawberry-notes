# Documentation Changelog

> Per-run entries from the doc-refresh procedure defined in [DOC_UPDATE.md](../DOC_UPDATE.md).
> Newest entries go on top.

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
