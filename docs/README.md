# Strawberry Notes — Documentation

Version-tracked documentation for the Strawberry Notes project.

> **How this is maintained:** see [DOC_UPDATE.md](../DOC_UPDATE.md) for the refresh playbook,
> and [CHANGELOG.md](CHANGELOG.md) for per-run change entries.

---

> **Thesis:** the self-hosted notebook with a first-class AI + agent interface.
> Rich-text, `[[wiki-linked]]`, semantically searchable, MCP-native, MIT-licensed,
> one `docker compose up`. See [leadership/overview.md](leadership/overview.md).

---

## Audiences

Docs are organised by who reads them. Pick your lane:

### [Technical](technical/README.md)
For engineers extending or operating the app. Architecture, database, API, auth, editor, uploads, frontend, testing, deployment, MCP, browser extension.

### [User](user/README.md)
For people using Strawberry Notes. Getting started, feature guide, troubleshooting.

### [Leadership](leadership/README.md)
For decision-makers and stakeholders. Product overview, stack rationale, roadmap, class-leader positioning.

---

## Quick Links

| Topic                       | File                                                                       |
| --------------------------- | -------------------------------------------------------------------------- |
| Class-leader positioning    | [leadership/overview.md](leadership/overview.md)                           |
| Roadmap (v1 / v1.1 / v1.2)  | [leadership/roadmap.md](leadership/roadmap.md)                             |
| System architecture         | [technical/architecture.md](technical/architecture.md)                     |
| API reference               | [technical/api-reference.md](technical/api-reference.md)                   |
| Database schema + pgvector  | [technical/database.md](technical/database.md)                             |
| MCP server + agent tools    | [technical/mcp.md](technical/mcp.md)                                       |
| Browser web clipper (MV3)   | [technical/extension.md](technical/extension.md)                           |
| Wiki-links & backlinks      | [technical/editor.md](technical/editor.md)                                 |
| Outbound webhooks (v1.4)    | [technical/webhooks.md](technical/webhooks.md)                             |
| Deploy with Docker          | [technical/deployment.md](technical/deployment.md)                         |
| First-time user setup       | [user/getting-started.md](user/getting-started.md)                         |
| Feature guide               | [user/features.md](user/features.md)                                       |
| Change history              | [CHANGELOG.md](CHANGELOG.md)                                               |

---

## Conventions

- **File paths** in docs are written relative to the project root (e.g. `lib/auth.ts`).
- **Line references** use `file:line` (e.g. `lib/auth.ts:45`).
- Each audience folder has its own `README.md` acting as a local index.
- Large docs follow the split strategy in [DOC_UPDATE.md](../DOC_UPDATE.md).
