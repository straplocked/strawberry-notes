# Strawberry Notes — Documentation

Version-tracked documentation for the Strawberry Notes project.

> **How this is maintained:** see [DOC_UPDATE.md](../DOC_UPDATE.md) for the refresh playbook,
> and [CHANGELOG.md](CHANGELOG.md) for per-run change entries.

---

## Audiences

Docs are organised by who reads them. Pick your lane:

### [Technical](technical/README.md)
For engineers extending or operating the app. Architecture, database, API, auth, editor, uploads, frontend, testing, deployment.

### [User](user/README.md)
For people using Strawberry Notes. Getting started, feature guide, troubleshooting.

### [Leadership](leadership/README.md)
For decision-makers and stakeholders. Product overview, stack rationale, roadmap.

---

## Quick Links

| Topic                       | File                                                                       |
| --------------------------- | -------------------------------------------------------------------------- |
| System architecture         | [technical/architecture.md](technical/architecture.md)                     |
| API reference               | [technical/api-reference.md](technical/api-reference.md)                   |
| Database schema             | [technical/database.md](technical/database.md)                             |
| Deploy with Docker          | [technical/deployment.md](technical/deployment.md)                         |
| First-time user setup       | [user/getting-started.md](user/getting-started.md)                         |
| Product overview            | [leadership/overview.md](leadership/overview.md)                           |
| What's in v1 / what isn't   | [leadership/roadmap.md](leadership/roadmap.md)                             |
| Change history              | [CHANGELOG.md](CHANGELOG.md)                                               |

---

## Conventions

- **File paths** in docs are written relative to the project root (e.g. `lib/auth.ts`).
- **Line references** use `file:line` (e.g. `lib/auth.ts:45`).
- Each audience folder has its own `README.md` acting as a local index.
- Large docs follow the split strategy in [DOC_UPDATE.md](../DOC_UPDATE.md).
