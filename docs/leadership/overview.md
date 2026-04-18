# Product Overview

[← Leadership TOC](README.md)

---

## What It Is

Strawberry Notes is a **self-hostable, multi-user notes application**. Each deployment runs on infrastructure the operator controls and supports an arbitrary number of user accounts. Notes are rich-text (TipTap/ProseMirror) with full-text search, folders, tags, pinning, soft-delete, image attachments, and bidirectional Markdown export/import. It installs as a Progressive Web App and degrades to read-only when offline.

---

## Who It's For

Three distinct users:

1. **The self-hoster** — someone who runs a server (`docker compose up`) and wants a notebook that isn't a SaaS. Values: control, privacy, portability, low maintenance burden.
2. **Small teams on shared infrastructure** — households, clubs, study groups, homelab shops. Each person has an account on the same deployment; nothing is shared between accounts in v1.
3. **Contributors** — developers who can read a small, well-organised Next.js codebase and extend it without negotiating with a framework.

The product is **not for**: organisations that need collaboration, compliance features, SSO, audit logs, or an account-management UI for admins. Those needs are legitimate, but a different product.

---

## Positioning

| Axis                  | Where Strawberry Notes sits                                                    |
| --------------------- | ------------------------------------------------------------------------------ |
| Hosting               | **Self-hosted.** No SaaS. No telemetry.                                        |
| Data ownership        | **Operator-owned.** Postgres + one volume. Backups are `pg_dump` + `tar`.      |
| Collaboration         | **None in v1.** Multi-user ≠ shared notes.                                     |
| Formatting            | **Rich-text editor** with Markdown as transport (not storage).                  |
| Mobile                | **PWA.** No native apps, no plans for them.                                    |
| Complexity posture    | **Deliberately small.** Non-bloat is a feature; see [roadmap.md](roadmap.md).   |

Closest analogues: Standard Notes (for the self-host ethos), Bear or Apple Notes (for the rich-text UX), Joplin (for the feature surface). Strawberry Notes differs from each on one axis: unlike Standard Notes it's rich-text-first and zero-config; unlike Bear/Apple Notes it's self-hosted and multi-user; unlike Joplin it's a web app, not a desktop sync client.

---

## Licensing

MIT. The license file is at the repo root. Contributions are accepted under the same licence; see [CONTRIBUTING.md](../../CONTRIBUTING.md).

---

## Status

- **Version:** v1, shipped.
- **Commit history:** initial Create Next App scaffold → v1 build commit → Docker fix → small perf tweak (font preload removed). See `git log` for the authoritative view.
- **Production readiness:** ready for personal and small-team deployments. Not hardened for adversarial multi-tenancy (i.e. don't offer accounts to strangers without additional process).
- **Support:** best-effort via GitHub issues.

---

## Sustainability Model

The project is written to be *maintained by one person in a weekend per quarter*:

- No build-step churn (Next.js + standalone output is stable).
- No SaaS dependencies.
- Small enough that one engineer can hold it in their head.
- Drizzle + Postgres, not an exotic ORM.
- Inline styles, not a design-system dep to version-lock.

If the codebase ever grows beyond what one careful reader can comprehend, that is a regression, not a feature. See the "non-bloat line" in [roadmap.md](roadmap.md).
