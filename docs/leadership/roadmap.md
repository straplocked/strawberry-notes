# Roadmap

[← Leadership TOC](README.md)

What shipped in v1, what we are explicitly **not** building, and what a plausible v2 could look like. The non-bloat line is load-bearing — read the last section before proposing work.

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

See [../../CHANGELOG.md](../CHANGELOG.md) for the per-doc-refresh history; see `git log` for the per-code-change history.

---

## Explicit Non-Goals

These are **not** coming in v2. Saying no keeps the product small.

- **Shared notes / collaboration / real-time co-editing.** Would require CRDTs (Yjs) or OT, plus a permission model, plus a sharing UI. Out of scope.
- **Organisations / tenants / role-based access control.** The single-user-per-account model is the whole point.
- **SSO / OAuth / SAML.** Self-hosters who need SSO deploy behind an identity-aware proxy (Authelia, Pomerium, Cloudflare Zero Trust). The app doesn't need to know.
- **End-to-end encryption.** Postgres sees plaintext. Users who need E2EE are better served by a product that's E2EE from the ground up.
- **Native mobile apps.** PWA install is the mobile story.
- **Plugin system / extension API.** Adds a large surface for marginal benefit at this size.
- **Telemetry / analytics / crash reporting.** The code doesn't phone home and won't.
- **A hosted SaaS.** The license permits anyone to run one; the project itself won't.

If one of these turns out to be the right call later, it becomes a **new product** or a **fork**, not a v2.

---

## Candidates for v2 (if we pick any of them)

These are compatible with the non-bloat line. None is committed.

- **Offline write queue.** Dexie is already installed. Queue edits in IndexedDB while offline and flush on reconnect. Main risk: conflict resolution. Mitigation: last-write-wins at document granularity, same as today.
- **Password reset self-service.** Email-based reset flow. Requires an SMTP config; that's the main operator burden.
- **Attachment GC.** Background job (or request-time sweep) that deletes `attachments` rows orphaned from notes, plus their files. Well-scoped.
- **Note linking.** `[[wiki-style]]` internal links resolved by title. Cheap in the ProseMirror layer; would need a migration for any index.
- **Export all.** Zip of every note as Markdown for a full backup-to-file.
- **Search over images (filename / alt text).** Included in the FTS doc already via adjacent columns if added.
- **Attachments beyond images.** PDFs, text files, etc. Requires magic-byte sniffing in the upload endpoint (see [../technical/uploads.md](../technical/uploads.md)).
- **Tag autocomplete / rename UI.** Tags are already modeled; needs UI.
- **Folder hierarchy (nested folders).** Schema already has `folderId: uuid | null`; nesting would add a `parentId` on `folders`. Tree UI is the hard part.

The selection rule is: **does this make the product meaningfully better for the self-hoster without adding a new external dependency or doubling the codebase?** If not, it stays in this list.

---

## The Non-Bloat Line

From `CONTRIBUTING.md`, reiterated here because it's easy to forget:

> Non-bloat: self-hostable first, stable tech, design files as spec.

Practical interpretation for future work:

1. **Every new dependency** must be justified against the one-engineer-weekend-per-quarter maintenance budget.
2. **Every new route** should be callable from an authenticated `curl` without special headers — the REST surface is the interface contract.
3. **Every new config knob** costs operator cognition. Default behaviour must be sensible with zero config.
4. **Every new UI surface** should fit in the existing three-pane layout or the tweaks panel. If it demands a fourth place, question whether the feature earns it.
5. **If a change doubles the file count of any single directory**, that's a signal to split it into a submodule or to reconsider the feature.

Keep the product small, the stack boring, and the code legible. That is the differentiator.
