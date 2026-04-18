# Documentation Changelog

> Per-run entries from the doc-refresh procedure defined in [DOC_UPDATE.md](../DOC_UPDATE.md).
> Newest entries go on top.

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
