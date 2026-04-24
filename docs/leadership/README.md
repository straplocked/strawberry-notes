# Leadership

Audience: decision-makers, stakeholders, and anyone wanting the "so what" of Strawberry Notes without reading the code.

| File                                 | What it covers                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| [overview.md](overview.md)           | What the product is, who it's for, what it deliberately isn't.                                  |
| [tech-stack.md](tech-stack.md)       | The stack, why each piece was chosen, vendor/maintenance risk, upgrade posture.                 |
| [roadmap.md](roadmap.md)             | What v1 shipped, explicit non-goals, candidate next steps, the "non-bloat" line we're holding.  |

---

## One-Paragraph Summary

Strawberry Notes is an MIT-licensed, self-hostable, multi-user, **AI-native** rich-text notes app. One Next.js container plus Postgres (with pgvector) on a server you control — no SaaS dependency, no telemetry, no lock-in. Beyond the notebook core (folders, tags, FTS, images, PWA, theming) it ships **`[[wiki-link]]` backlinks**, **semantic search** over any OpenAI-compatible embeddings endpoint, a **full-workspace ZIP export**, a **Chrome/Firefox web clipper**, and a **first-class MCP endpoint** so Claude Desktop / Cursor / any agent can read, search, and write your notes over the same transport humans use. The thesis: *the self-hosted notebook with a first-class AI + agent interface*. See [overview.md](overview.md) for the class-leader positioning.
