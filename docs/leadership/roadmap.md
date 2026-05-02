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

## v1.3 — Public-launch hardening (shipped 2026-04-28)

The pre-launch checklist that turned a v1.2 private deployment into a v1.3 public-deployment-ready release. Tracked in this section, tier by tier — the four tiers below all landed.

### Tier 1 — landed

- `.env.example` at the repo root documenting every supported variable (the README references it; previously missing).
- **Open-signup gate.** New `ALLOW_PUBLIC_SIGNUP` env (default `false`). Closed instances 404 the `/signup` page and `POST /api/auth/signup`. Operators provision via `npm run user:create`.
- **Operator CLIs.** `npm run user:create` and `npm run user:reset` (with shared `lib/auth/user-admin.ts` helpers) replace the previous "edit `users.passwordHash` by hand" recovery path.
- **Per-IP / per-user rate limits.** In-process token-bucket limiter (`lib/http/rate-limit.ts`) protects `POST /api/auth/signup` (5/IP/hr), the credentials sign-in callback (10/IP/min), and `POST /api/tokens` (20/user/hr). 429 + `Retry-After` on denial. Single-process scope; operators running multiple replicas should layer an upstream limiter at the proxy.
- **Public-facing README** with a head-to-head comparison table, an explicit maintainer-commitment paragraph, and operator-command index.
- **Signup, user-admin, rate-limit, and signup-policy** all unit-tested.

### Tier 2 — landed

- **Time-range filters in the sidebar.** New `Time` section with **Today**, **Yesterday**, **Past 7 days**, **Past 30 days** entries that filter the second pane on `notes.updatedAt` — they behave like a folder view, not like a dedicated note. The filter is also exposed on `GET /api/notes?folder=today` etc. and on the MCP `list_notes` tool. Implementation: `lib/notes/time-range.ts` (~40 LOC), one extra branch in `listNotes`. The earlier draft of this slice (a dedicated `Daily` folder + idempotent `POST /api/notes/daily`) was reverted in favour of the filter model — a folder per day is overkill, and a filter composes naturally with sort and search.
- **Welcome note on first run.** Both signup paths (the public route + `npm run user:create`) now seed a `Welcome to Strawberry Notes` note alongside the `Journal` folder via shared `lib/auth/first-run.ts`. The note doubles as a feature tour for `[[wiki-links]]`, semantic search, MCP, and exports.
- **PWA polish.** `viewport.themeColor` in `app/layout.tsx` is now a media-query pair so iOS / Android render the correct address-bar colour for the user's light/dark preference.

Non-bloat justification: zero new runtime deps; one new lib module each for `rate-limit`, `user-admin`, `first-run`, and `time-range`; two CLI shells in `scripts/`; two env knobs; the time filter adds **four** new query-string tokens but no new routes. Default behaviour with zero config is now *more conservative* (signup gated) and *more useful* (Welcome note + time filters) than v1.2.

### Tier 3 — landed

- **Nested folders.** `folders.parent_id` (migration `0007`) lets folders form a tree. The sidebar renders the tree with collapse/expand chevrons and a per-folder "+" button to add a sub-folder under any node. `ON DELETE CASCADE` on the self-FK means deleting a parent removes the entire subtree of folders; notes inside fall back to All Notes via the existing `notes.folder_id ON DELETE SET NULL`. Cycle prevention lives in `lib/notes/folder-service.ts` (`assertParentLegal`) — Postgres has no native check. The MCP gains an `update_folder` tool so agents can reparent or rename programmatically; `create_folder` accepts `parentId`. Old flat-folder layouts continue to work unchanged because top-level folders just have `parent_id = NULL`.
- **Tag rename + merge UI.** New **Tags** section in `Settings` lists every tag with its note count, an inline rename, and a delete. Renaming to a name that already exists triggers a confirm + merge — every `note_tags` row pointing at the source is rewritten to the existing tag (`ON CONFLICT DO NOTHING` handles notes that already had both), then the source row is dropped. Exposed at `PATCH /api/tags/:id` and `DELETE /api/tags/:id`, plus MCP tools `rename_tag` / `delete_tag`. Tag service moved from a single `listTags` to a real `lib/notes/tag-service.ts` with merge-aware operations.
- **Trigram index on `notes.title`.** Migration `0006` enables `pg_trgm` and adds a GIN index `notes_title_trgm_idx ON notes USING gin (title gin_trgm_ops)`. The existing ILIKE scan in `GET /api/notes/titles` (the `[[` autocomplete) and in the FTS-fallback branch of `listNotes` now uses the trigram index automatically; no query changes needed. Keeps the autocomplete fast into the thousands of notes per user.

Non-bloat justification: zero new runtime deps; two SQL migrations (one extension + index, one column + FK + index); one new file each for `app/api/tags/[id]/route.ts` and `components/app/settings/TagsSection.tsx`. Folder service grew from 60 LOC to ~150 with cycle detection; MCP gained three tools that mirror the new REST surface.

### Tier 4 — landed

The deploy-hardening tier — what was missing before the project was comfortable running on a home-lab box (Unraid, Synology, a Pi 5, a small VPS) for daily use.

- **`/api/health` endpoint.** Public, unauthenticated, never rate-limited. Pings Postgres with a 1 s bounded timeout and returns `{ ok: true, db: 'up' }` 200 / `{ ok: false, db: 'down', error }` 503. Suitable for both Docker probes and reverse-proxy health checks.
- **`app`-service compose healthcheck.** `docker-compose.yml` now declares a `healthcheck` for the `app` service that calls `/api/health` via `node -e "fetch(...)"` (alpine has no curl). Interval 30 s, start period 30 s, retries 5. `docker compose ps` now reports `(healthy)` once the app is actually serving — previously only Postgres had a health probe.
- **Unraid deployment notes.** [../technical/deployment.md](../technical/deployment.md) gains an **Unraid** section covering UID 1001 ownership of host bind mounts (`/mnt/user/appdata/strawberry-notes/{uploads,pgdata}`), the Community-Applications-style env table, and the `EMBEDDING_ENDPOINT=http://<lan-ip>:11434/v1` recipe for an Ollama sibling container.

Non-bloat justification: one new tiny route (~30 LOC + a unit test); one compose stanza; doc-only Unraid pass; zero new deps. The route is read-only and returns a single status string — no rate-limiting, no auth surface to harden.

---

## v1.4 — Platform-readiness (planned)

The slate that takes Strawberry Notes from "self-host it from a checkout" to "install it from the Unraid Community Apps store and use it daily without operator overhead." Two tiers, ordered so a single-user daily driver is fully featured *before* anything is published for strangers to install.

### Tier 1 — daily-driver complete

The capabilities a single user needs to actually live in the app, in priority order:

- **Outbound webhooks.** *(shipped 2026-04-29)* — Five lightweight events fired from the existing service layer — no new event bus, no pub/sub. Each call site that already mutates state (`createNote`, `updateNote`, etc.) gains a single `fireEvent(...)` line. Events:
  - `note.created` — agent-or-user-created (excludes the auto-seeded Welcome note).
  - `note.updated` — debounced 5 s after the last keystroke; payload carries which fields changed (title / content / folder / pinned / tags).
  - `note.trashed` — soft-delete. Hard-delete (`note.purged`) deferred unless an integration explicitly needs it.
  - `note.tagged` — fires once per tag-add; carries the tag name. Symmetric `note.untagged` is *not* shipped (asymmetric on purpose: integrations care when something becomes "blog-tagged", rarely when it loses a tag).
  - `note.linked` — fires when a `[[wiki-link]]` *resolves* to an existing note. Strawberry-specific and uniquely useful: "tell me when anything links to my daily note." Only fires on resolve, not on every keystroke that contains `[[`.

  Delivery: HMAC-SHA-256-signed payload (`X-Strawberry-Signature` header, per-webhook secret shown to the operator once at create time, hashed at rest like the API tokens). Retry: exponential backoff up to 5 attempts. Dead-letter after 5 consecutive 5xx — webhook auto-disables and surfaces a Settings warning. New table `webhooks(id, userId, url, secretHash, events[], lastSuccessAt, lastFailureAt, consecutiveFailures, createdAt)` and a small Settings panel.

- **SMTP / email.** *(shipped 2026-04-29)* — `SMTP_HOST/PORT/USER/PASS/FROM/SECURE` env block, `lib/email/{client,templates}.ts`, and one runtime dep (`nodemailer`, promoted from a transitive that Auth.js was already pulling in — net new bundle weight: ~0). Self-service password reset is the use case: `/forgot-password` mints an `srt_<64-hex>` token (SHA-256 hashed, 1-hour single-use, stored in `password_reset_tokens`), emails the user a `${AUTH_URL}/reset-password?token=…` link, and `/reset-password` consumes it inside the same transaction that updates `users.passwordHash`. Always-200 on `forgot-password` so the surface can't enumerate accounts. Rate-limited 3/IP/hr (forgot) + 10/IP/hr (reset). Graceful degrade: SMTP unset → page surfaces a "ask the operator" hint instead of pretending. Migration `0009_password_reset.sql` and `lib/auth/password-reset.ts`.

- **Notification fan-out + preferences.** *(shipped 2026-05-01)* — Five additional emails ride on the same SMTP path:
  - `passwordChanged` — fired from both the self-service reset and the operator CLI; "if this wasn't you, here's the login URL".
  - `tokenCreated` — fired on personal-access-token mint; "if you didn't make this, revoke now".
  - `webhookCreated` — same shape, for outbound webhooks.
  - `webhookDeadLetter` — fired on the threshold-crossing fire when a webhook auto-disables after 5 consecutive failures.
  - `confirmationEmail` — fired at signup when `REQUIRE_EMAIL_CONFIRMATION=true`. Operator-level toggle (signup creates `users.email_confirmed_at = null`, the credentials provider rejects sign-in until the user clicks `${AUTH_URL}/confirm-email?token=ecf_<64-hex>`). Operator-created accounts via `npm run user:create` are pre-confirmed.

  The four event-shaped notifications are gated by per-user toggles in a new **Email notifications** Settings panel (one row per kind, default ON, lazy-created table `user_email_preferences`). Signup confirmation is *not* per-user — it's the operator's instance-level decision. New routes: `/api/email-preferences` (GET/PATCH), `/api/auth/confirm-email`, `/api/auth/resend-confirmation`. New page: `/(auth)/confirm-email`. Migration `0010_email_notifications.sql`. Two new modules — `lib/email/{notifications,preferences}.ts` and `lib/auth/email-confirmation.ts` — re-using the existing nodemailer transport and HMAC patterns; zero net new deps.

- **S3-compatible storage backend.** New `lib/storage/driver.ts` interface; the existing local-filesystem code is extracted as `LocalDriver`; `S3Driver` is added. Env-toggled with `STORAGE_BACKEND=local|s3` (default `local` — zero-config behaviour unchanged) plus a standard `S3_*` block (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`). Covers AWS S3, Cloudflare R2 (free tier — primary recommendation for self-hosters), Backblaze B2, MinIO, Wasabi, and any other S3-compatible object store. Uploads write directly to the driver; the existing `/api/uploads/[id]` endpoint streams via the driver too, with the ownership check unchanged.

- **Storage migration script.** `scripts/storage-migrate.ts` driven by `npm run storage:migrate -- --from=<local|s3> --to=<local|s3> [--dry-run]`. Iterates `attachments`; for each row, streams the file from the source driver and writes to the destination, then updates `attachments.storage_path` in a per-row transaction. Idempotent — a re-run after a partial failure picks up where it left off. Verbose progress output. The same script handles the reverse direction; ops can move from S3 back to local without surgery.

Non-bloat budget for Tier 1: **two** new runtime deps (`nodemailer`, `@aws-sdk/client-s3` — the latter is the smallest S3 SDK that supports R2 / B2 / MinIO without quirks). One new table (`webhooks`). Three new env blocks (SMTP, S3, `STORAGE_BACKEND`). One new Settings panel (Webhooks). One new endpoint group (`/api/webhooks/*`) and one MCP tool family for parity. The existing storage code path becomes one polymorphic call site instead of N hard-coded ones — net file count grows by ~5, not doubles.

### Tier 2 — public-release prep

What turns the project into something a stranger can install in three clicks. Only worth doing *after* Tier 1 — there is no point publishing an image until it's the image you'd want to install.

- **Container registry publishing.** GitHub Actions workflow tags-on-release → `ghcr.io/straplocked/strawberry-notes:vX.Y.Z` + `:vX` + `:latest`. Multi-arch (`linux/amd64` + `linux/arm64`) so a Pi 5 / Apple Silicon homelab box works without rebuild. SBOM + provenance attestations via `actions/attest-build-provenance` for verifiable supply chain.
- **Unraid Community Apps template.** XML template in a sibling repo (`strawberry-notes-unraid` or `unraid-templates`) listing the four required env vars, the optional S3 / SMTP / embedding blocks, the named volumes, the `WebUI` field pointing at `/api/health`, and an icon. Submit to the Community Applications maintainers. The template references the GHCR image — no build-from-source on the user's box.
- **Install-from-Unraid documentation.** New top-level subsection in [../technical/deployment.md](../technical/deployment.md) under **Unraid** describing the Community Apps install path step-by-step, with screenshots if cheap.
- **README install matrix.** Three install paths above the existing quickstart: **Unraid Community Apps** (one-click), **Pre-built image** (`docker run ghcr.io/straplocked/strawberry-notes:latest`), **Source build** (the existing `cp .env.example .env && docker compose up -d` path, retitled "Build from source").
- **Versioned releases.** Tag `v1.4.0` on the merge of the last Tier 1 PR. Conventional `git describe`-friendly tagging from there forward; the registry workflow keys off tags.

Non-bloat budget for Tier 2: zero new runtime deps. One new GitHub Actions workflow file. One template XML in a sibling repo. Doc-only changes in this repo.

---

## v1.5 — Private Notes (shipped 2026-05-02)

The headline tension that drove this slice: shipping a first-class MCP integration means anything in the workspace is one `search_semantic` call away from being copied into an LLM's context. Most notes are fine with that — but a journal entry, a list of medications, or a draft of a sensitive email isn't. **Private Notes** is the per-note opt-in lever that gives users a place to put those.

The feature ships as four PRs ([#50](https://github.com/straplocked/strawberry-notes/pull/50), [#54](https://github.com/straplocked/strawberry-notes/pull/54), [#55](https://github.com/straplocked/strawberry-notes/pull/55), and the docs PR you're reading). User-facing copy never says "E2EE" — the threat model is narrower than vault-style products and we don't want to overclaim.

**What lands:**

- **Per-note opt-in encryption.** Editor toolbar gets a 🔒 lock toggle. Toggling on encrypts the body client-side with AES-256-GCM and saves the ciphertext + IV envelope; the server clears `contentText` / `snippet` / `hasImage` / `embeddingStale` for the row.
- **Crypto envelope.** PBKDF2-SHA-256 @ 600 000 iterations derives a KEK from the user's passphrase, which wraps a 32-byte random Note Master Key (NMK). A separate KEK derived from a one-time recovery code wraps the same NMK. Both wraps live in a new `user_encryption` table; the server never sees the passphrase, the recovery code, or the unwrapped NMK. WebCrypto-native — **zero new runtime deps**.
- **Recovery model.** Recovery code shown once at setup, gated behind a typed-confirmation modal. Lose both the passphrase and the code = lose the bodies, full stop.
- **MCP / clipper invisibility.** Every read tool (`list_notes`, `search_notes`, `search_semantic`, `get_note`, `get_backlinks`, `export_note_markdown`) and the bearer-supporting `/api/notes/search/semantic` route pass `{ includePrivate: false }` into the service layer. Bearer callers see no private rows and get `not found` for any private note id. The token-mint UI surfaces this contract.
- **Settings → Privacy panel.** Set up / unlock / lock-now / change passphrase / regenerate recovery code / disable. Auto-lock minutes (default 60) is user-tunable. Cross-tab sync via `BroadcastChannel`; tab-close locks via `pagehide`.
- **Workspace export.** Private notes serialise as `notes/<title>-<id>.encrypted.json` envelopes alongside a top-level `README.txt` explaining decrypt is impossible without the user's passphrase or recovery code.
- **Operator at-rest guidance.** New "Database at rest" section in [../technical/deployment.md](../technical/deployment.md) covering LUKS / EBS / Synology / Unraid native volume encryption + an encrypted-backup recipe. Private Notes protects sensitive bodies from the operator and from MCP; disk encryption protects everything else from stolen disks and leaked backups.

Non-bloat justification: zero new runtime deps; one new table (`user_encryption`); one new column (`notes.encryption`); one new lib module (`lib/crypto/private-notes.ts` + a small client store); one new Settings panel; one new doc. Backend gating threads a single `includePrivate` flag through existing service-layer functions — no parallel "private notes service" to maintain.

Threat model + full implementation map in [../technical/private-notes.md](../technical/private-notes.md).

---

See [../../CHANGELOG.md](../CHANGELOG.md) for per-doc-refresh history; `git log` for per-code-change history.

---

## Explicit Non-Goals

These are **not** coming. Saying no keeps the product small.

- **Shared notes / collaboration / real-time co-editing.** Would require CRDTs (Yjs) or OT, plus a permission model, plus a sharing UI. Out of scope — different product.
- **Organisations / tenants / role-based access control.** The single-user-per-account model is the whole point.
- **SSO / OAuth / SAML.** Self-hosters who need SSO deploy behind an identity-aware proxy (Authelia, Pomerium, Cloudflare Zero Trust). The app doesn't need to know.
- **Full-workspace E2EE by default.** Postgres still sees plaintext for the default note experience. Per-note opt-in encryption ships in v1.5 — see [Private Notes](#v15--private-notes-shipped-2026-05-02). Users who want every note encrypted client-side from the moment of creation are better served by a product that's E2EE from the ground up (Standard Notes, Joplin with E2EE).
- **Native mobile apps.** PWA install is the mobile story.
- **Plugin system / extension API.** The web clipper is a *consumer* of the existing API, not a plugin surface. Adding a plugin model would double the surface for marginal benefit.
- **Telemetry / analytics / crash reporting.** The code doesn't phone home and won't.
- **A hosted SaaS.** The license permits anyone to run one; the project itself won't.
- **Google Drive / Dropbox / OneDrive storage backends.** The S3-compatible driver landing in v1.4 covers the same job (durable, off-host, restorable) without an OAuth consent dance, per-user-scoped credentials, refresh-token rotation, or quota-enforcement edge cases. Cloudflare R2's free tier makes S3-compatible the right zero-cost answer for self-hosters; consumer-cloud-storage is a different product.
- **Database engines other than Postgres.** SQLite or MySQL would gut the FTS (`tsvector`), the trigram index (`pg_trgm`), and the semantic-search story (`pgvector`). Those three Postgres extensions are what makes the search experience class-leading; abstracting them away is a different product.

If one of these turns out to be the right call later, it becomes a **new product** or a **fork**, not a v2.

---

## Candidates for v1.4+ (none committed)

Compatible with the non-bloat line. Items committed to v1.4 above (webhooks, SMTP / password reset, S3 storage, registry publishing) have been removed from this list. What remains:

- **Offline write queue.** Dexie is already installed. Queue edits in IndexedDB while offline and flush on reconnect. Main risk: conflict resolution. Mitigation: last-write-wins at document granularity, same as today.
- **Graph view.** Backlinks already feed a graph — the hard part is layout. Use D3-force or similar client-side only; no server change needed.
- **Drag-to-reparent folders.** The schema and API already support `parentId` updates from v1.3 Tier 3. The remaining work is the sidebar interaction model and a "Move to…" submenu in the folder hover actions for keyboard-only reparenting.
- **Custom time-range picker.** v1.3 Tier 2 shipped Today / Yesterday / Past 7 / Past 30 as fixed buckets. A custom-range picker, a per-folder time view that composes time + folder, and a "today's note" template that pre-fills the editor on **+** while Today is selected are natural extensions.
- **Attachments beyond images.** PDFs, text files, etc. Requires magic-byte sniffing in the upload endpoint (see [../technical/uploads.md](../technical/uploads.md)). Pairs naturally with the v1.4 S3 driver — large attachments off-host immediately.
- **In-editor tag autocomplete.** v1.3 Tier 3 shipped tag rename + merge + delete in Settings. The remaining gap is autocomplete in the inline tag editor (currently the editor only suggests tags the user already types into).
- **`all.zip` re-import.** Closes the symmetric-backup loop; manifest schema is already stable.
- **Per-user embedding model choice.** Let users pick between short-context and long-context embedding models when the operator has more than one configured.
- **Inbound triggers / scheduled events.** v1.4 ships *outbound* webhooks fired from existing service-layer events. A symmetric *inbound* surface (e.g. `digest.daily` fired by an internal scheduler at the user's chosen local time, or `note.reminder` fired by a `#remind/2026-05-01` tag) would extend the integration story but adds a scheduler and a tag-pattern parser — defer until a concrete use case demands it.

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
