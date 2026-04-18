# Tech Stack

[← Leadership TOC](README.md)

What's in the box, why it's there, and what maintenance looks like.

---

## The Stack

| Layer                | Choice                                   | Rationale                                                                                                     |
| -------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Framework            | **Next.js 16** (App Router, standalone)  | One process for frontend + backend. Standalone output → trivial Docker image. Well-documented, well-staffed. |
| Language             | TypeScript (strict)                      | Cheap insurance on a small codebase; near-zero cost given Next's defaults.                                    |
| UI                   | React 19                                 | Required by Next 16. Nothing exotic on top.                                                                   |
| Editor               | **TipTap 3** (ProseMirror)               | Stable, modular, widely-used. Storing ProseMirror JSON is durable.                                            |
| Database             | **Postgres 16**                          | Proven, free, one process to run. JSONB holds the ProseMirror doc; tsvector does FTS.                         |
| ORM                  | **Drizzle**                              | Lightweight, migration-first, TypeScript-native. Stays out of the way.                                        |
| Auth                 | **Auth.js v5** (credentials + JWT)       | No external IdP needed for a self-hosted deployment. Cookie-based JWT = no session table to maintain.         |
| Server state (FE)    | TanStack Query 5                         | Industry standard. Handles caching, invalidation, optimistic updates.                                         |
| UI state             | Zustand 5                                | ~1 KB. Fits the scope; no Redux ceremony.                                                                     |
| Validation           | Zod 4                                    | Request validation where it matters; no global boilerplate.                                                   |
| Offline              | Vanilla service worker                   | Read-only SWR for now. Dexie is installed for a future write-queue but not used in v1.                        |
| Tests                | Vitest + Testing Library                 | Fast enough to leave in watch mode.                                                                           |
| Container            | Multi-stage Dockerfile + tini            | Small image. Non-root user. Postgres wait + migrate in entrypoint.                                            |

No SaaS dependencies. No telemetry. No external CDN. No OAuth provider. No Redis. No workers. No queue. No CMS.

---

## Why Not X?

Short answers to the questions operators usually ask:

- **Why not SQLite?** FTS in Postgres is mature (`tsvector`, `websearch_to_tsquery`). The extra process is free under Docker; swapping DBs later would cost more than running Postgres from day one.
- **Why not Prisma?** Drizzle has a smaller runtime, no code-gen step, and migrations are plain SQL you can read. Prisma is also fine; Drizzle happened to fit the "stays out of the way" brief better.
- **Why not Tailwind?** The styled surface is small enough that inline style objects + CSS custom properties for theming is simpler than any utility framework. No build plugin, no `content` config to break.
- **Why not a design system (MUI, Chakra, shadcn)?** Same reason. One less major-version upgrade to track. The icon set is hand-rolled SVG and is cheap to maintain.
- **Why not Remix / SvelteKit / SolidStart?** Next.js has the largest documentation surface and the most plausible five-year maintenance story for a self-hosted app.
- **Why not server actions?** REST over `fetch` is perfectly fine at this size, and it makes the backend trivially callable from any future client (mobile app, CLI, integrations). Server actions are a framework lock-in we didn't need.
- **Why no OAuth?** Every OAuth provider is a new failure mode for a self-hoster. Credentials + a strong password covers the users we're optimising for.

---

## Vendor & Maintenance Risk

| Dependency         | Risk                                                                                                 | Mitigation                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Next.js            | Major versions bring breaking changes.                                                               | Standalone output is stable across majors; pin to known-good, upgrade deliberately.  |
| Auth.js            | Currently on `5.0.0-beta.x`. Beta API.                                                               | Config surface used is small. Lift-and-shift to the stable API when it lands.        |
| TipTap             | Extensions churn between majors.                                                                     | Only core extensions used; PM JSON is stable regardless.                             |
| Postgres           | None material.                                                                                       | —                                                                                    |
| Node 20            | LTS until 2026-04.                                                                                   | Bump to Node 22 LTS in the `Dockerfile` before EOL.                                  |

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
- All API routes check ownership (`requireUserId()` + user-scoped WHERE).
- Uploads: MIME-whitelisted, size-capped, ownership-checked on every GET.
- TLS is delegated to a reverse proxy (Caddy / nginx / Cloudflare). The app never terminates TLS itself.
- No telemetry; no third-party JS loads in the browser.
- Formal pentesting: not performed. Responsible disclosure policy in SECURITY.md.
