# Testing

[← Technical TOC](README.md)

Vitest + Testing Library, run via `npm test` (one-shot) or `npm run test:watch`.

- Config: `vitest.config.ts`
- Setup: `vitest.setup.ts`
- Files: any `**/*.test.{ts,tsx}` outside `node_modules/` and `.next/`

---

## Current Coverage

| Test file                                    | What it covers                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| `lib/editor/prosemirror-utils.test.ts`       | `docToPlainText`, `snippetFromDoc`, `countTasks` edge cases.                   |
| `lib/markdown/markdown.test.ts`              | Round-trip Markdown ↔ ProseMirror JSON for the documented node/mark set.       |
| `lib/format.test.ts`                         | `formatDate` day-relative rules (today / yesterday / weekday / same-year / prior-year) + midnight-crossing calendar-diff. |
| `lib/storage.test.ts`                        | Upload MIME allowlist, extension mapping, `maxUploadBytes` env handling with 1 MiB floor, `uploadsDir` env override. |
| `lib/design/accents.test.ts`                 | Accent list order + shape, `accentById` lookup + fallback, `DEFAULT_SETTINGS`. |
| `lib/api/client.test.ts`                     | REST client URL + method + body shape; filter-omission in `notes.list`; non-ok response raises a descriptive error. |
| `lib/store/ui-store.test.ts`                 | Zustand store defaults, `setView` clears search, settings persistence to localStorage, theme-aware `--berry-soft`, `hydrateSettingsFromStorage` with empty / garbage / partial payloads. |

Guiding rule: cover logic that is easy to regress silently (editor utils, markdown, date formatting, MIME gating, store hydration) and the outward-facing API client shape. Component rendering and DB-bound logic are still out of scope for v1.

---

## Explicit Gaps

No tests exist for:

- API route handlers (`app/api/**/route.ts`).
- Auth flow (signup, sign-in, session gating).
- React components (no component tests yet).
- Upload endpoint end-to-end (MIME/size rejection + ownership checks at the HTTP layer — the pure helpers in `lib/storage.ts` are now covered).
- Folder / tag upsert logic (`lib/notes/tag-resolution.ts` — needs a real Postgres).

If you're adding coverage, the highest-value targets in priority order:

1. **API route handlers** — integration tests against a real (or sqlite-shaped) DB that assert cross-user isolation on every endpoint.
2. **Auth signup/signin** — the two code paths where a mistake turns into a security bug.
3. **Upload ownership check** — the single biggest cross-user risk if regressed.

---

## Running Locally

```bash
npm test            # one-shot, CI-friendly
npm run test:watch  # watch mode
```

jsdom is the runner environment, so DOM APIs are available without a browser.

---

## Writing New Tests

- Place tests next to the code: `foo.ts` ↔ `foo.test.ts`.
- Prefer module-level tests over integration when the logic is pure.
- If a test needs the DB, spin Postgres via `docker compose up postgres` and point `DATABASE_URL` at it; there is no in-memory alternative because the schema uses Postgres-specific features (JSONB, tsvector).
- For component tests, import from `@testing-library/react` (already a dev dep). Mock `lib/api/client.ts` at the module level rather than intercepting `fetch`.

There is no CI pipeline configured in the repo today. If/when one is added, hook `npm run typecheck && npm run lint && npm test` as the minimum gate.
