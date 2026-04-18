# DOC_UPDATE — Documentation Refresh Plan

> This file is the **playbook** for keeping Strawberry Notes' documentation in sync with the codebase.
> It is **referenced every time** the user invokes the doc-refresh prompt.
> Per-run change entries do **not** live here — they are appended to [docs/CHANGELOG.md](docs/CHANGELOG.md).

---

## Run Counter

| Metric       | Value        |
| ------------ | ------------ |
| Total runs   | **1**        |
| First run    | 2026-04-18   |
| Last run     | 2026-04-18   |

> Increment `Total runs` and update `Last run` on every invocation. Record the actual changes
> made during that run in [docs/CHANGELOG.md](docs/CHANGELOG.md), not here.

---

## Purpose

The doc-refresh job keeps three audiences supplied with current, accurate documentation:

1. **Technical** — developers extending or operating the app (architecture, APIs, schema, deploy).
2. **User** — end users of Strawberry Notes (features, workflows, troubleshooting).
3. **Leadership** — decision-makers needing product context (overview, stack, roadmap, risk).

All docs live under [docs/](docs/) so they are version-tracked with the code. A top-level
[docs/README.md](docs/README.md) acts as the index; each audience has its own subfolder
with its own local TOC.

---

## The Procedure (run this every time the user invokes the refresh prompt)

1. **Read this file first.** Note the current run count.
2. **Scan the codebase.** Cover everything under the project root except `node_modules/`, `.next/`, `.git/`, build/lock files, and `tsconfig.tsbuildinfo`. Focus on:
   - `app/` — routes + layouts
   - `components/` — UI
   - `lib/` — shared logic (db, auth, api, editor, markdown, storage, store, design)
   - `drizzle/` — migrations
   - `docker/` + `docker-compose.yml` + `.env.example`
   - `package.json` — scripts & deps
   - Config files at the root
3. **Diff against existing docs.** For each doc file in `docs/`, check whether current codebase reality still matches. Reality beats memory — if code disagrees with a doc, update the doc.
4. **Apply edits.** Prefer `Edit` over `Write` for surgical updates. Only rewrite a file when its structure no longer reflects the feature shape.
5. **Large-file strategy** (see next section) — enforce split thresholds.
6. **Update cross-references.** If files moved/split, update every linking TOC.
7. **Increment the run counter** in this file (`Total runs`, `Last run`).
8. **Append a run entry** to [docs/CHANGELOG.md](docs/CHANGELOG.md) with:
   - Date stamp (`YYYY-MM-DD`)
   - Run number
   - Summary of what changed and why
   - List of files touched

---

## Large-File Strategy

A single doc longer than ~400 lines becomes hard to navigate. When a doc grows past threshold:

1. **Identify natural seams.** Headings at H2 are usually the split boundary.
2. **Create a folder** named after the original file (e.g., `api-reference.md` → `api-reference/`).
3. **Replace the original file with an index** (`api-reference/README.md`) containing a table of contents + 1–2 sentence summary per child section.
4. **Move each H2 section** to its own file inside the folder. Keep file names lowercase-kebab.
5. **Add a "Parent TOC" link** at the top of each child file so readers can navigate back.
6. **Update the top-level [docs/README.md](docs/README.md)** to point at the new index.

Thresholds:

| Size              | Action                                        |
| ----------------- | --------------------------------------------- |
| < 250 lines       | Keep as single file.                          |
| 250–400 lines     | Keep, but add a local TOC at the top.         |
| > 400 lines       | Split per the procedure above.                |

---

## Documentation Inventory (current layout)

```
docs/
├── README.md                       ← master TOC
├── CHANGELOG.md                    ← per-run change log
├── technical/
│   ├── README.md                   ← technical TOC
│   ├── architecture.md
│   ├── database.md
│   ├── api-reference.md
│   ├── auth.md
│   ├── editor.md
│   ├── uploads.md
│   ├── frontend.md
│   ├── testing.md
│   └── deployment.md
├── user/
│   ├── README.md                   ← user TOC
│   ├── getting-started.md
│   ├── features.md
│   └── troubleshooting.md
└── leadership/
    ├── README.md                   ← leadership TOC
    ├── overview.md
    ├── tech-stack.md
    └── roadmap.md
```

When adding a new audience or new topic, keep the three-tier shape; don't pile mixed-audience
content into one folder.

---

## Invariants

- **Do not** dump changelog entries into this file. They belong in [docs/CHANGELOG.md](docs/CHANGELOG.md).
- **Do not** create docs outside the `docs/` tree (except `README.md`, `CONTRIBUTING.md`,
  `SECURITY.md`, `CODE_OF_CONDUCT.md`, `LICENSE`, and `CLAUDE.md` at the root — those are standard).
- **Do not** let this file drift. If the folder layout changes, update this file in the same run.
- **Do not** skip the run-counter increment; it is the measurement.
- **Do not** create documentation the user did not ask for (e.g. per-component pages) — the three
  audiences are the contract.
