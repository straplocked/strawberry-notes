# MCP Server

[← Technical TOC](README.md)

Strawberry Notes exposes a [Model Context Protocol](https://modelcontextprotocol.io) server at `POST /api/mcp`. Any MCP-compatible client (Claude Desktop, Claude Code, Cursor, custom SDK clients) can connect, authenticate with a personal access token, and act on the signed-in user's notes through a small tool set.

The endpoint re-exposes the existing REST surface — it is not a new product surface. Everything the endpoint can do, an authenticated `curl` against `/api/notes` etc. can also do.

---

## Endpoint

| Method | Path           | Purpose                                                  |
| ------ | -------------- | -------------------------------------------------------- |
| POST   | `/api/mcp`     | Single-message, stateless JSON-RPC 2.0 over HTTP.        |
| GET    | `/api/mcp`     | 405 — streaming is not supported in v1.                  |
| DELETE | `/api/mcp`     | 405 — session termination is not supported in v1.        |

The implementation uses `WebStandardStreamableHTTPServerTransport` from `@modelcontextprotocol/sdk` with `sessionIdGenerator: undefined` and `enableJsonResponse: true`. Every request is independent: no session state, no SSE, no subscriptions.

---

## Authentication

`Authorization: Bearer <token>` is **required**. Session cookies are not accepted on `/api/mcp` — this avoids CSRF from a browser with a Strawberry session open. The bearer flow:

1. Sign into Strawberry Notes in a browser.
2. Go to **Settings** (gear icon in the sidebar) → **Personal Access Tokens**.
3. Click **Create token**, give it a name (e.g. "Claude Desktop").
4. Copy the token that appears. It is shown **once**; the server keeps only a SHA-256 hash.
5. Use the token in the `Authorization` header.

Tokens are revocable on the same page. A revoked token fails all future `/api/mcp` calls with `401`.

Token format: `snb_` + 64 hex chars (32 random bytes). The first 12 chars are stored as a display prefix so you can identify tokens in the UI.

---

## Tool Reference

All tools act on the authenticated user. Cross-user access is structurally impossible — the user id is bound to the server instance at request time and never comes from tool arguments.

| Tool                   | Inputs                                                                                          | Result                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `list_notes`           | `folder?`, `tag?`, `q?`                                                                         | Array of note summaries (id, title, snippet, …). |
| `search_notes`         | `query`                                                                                         | Same shape as `list_notes`, filtered by FTS.     |
| `get_note`             | `id`                                                                                            | Full note **as Markdown** plus metadata.          |
| `create_note`          | `folderId?`, `title?`, `markdown?`, `tagNames?`                                                 | Created note summary.                             |
| `update_note`          | `id`, `title?`, `markdown?`, `folderId?`, `pinned?`, `tagNames?`, `trashed?`                    | Updated note summary.                             |
| `delete_note`          | `id`, `hard?` (default `false` — soft delete / Trash)                                           | `{ id, deleted: "soft" \| "hard" }`.             |
| `list_folders`         | —                                                                                               | Array of folders with counts.                     |
| `create_folder`        | `name`, `color?` (`#rrggbb`)                                                                    | Created folder.                                   |
| `list_tags`            | —                                                                                               | Array of tags with counts.                        |
| `add_tag`              | `noteId`, `name`                                                                                | `{ noteId, tagId }`. Idempotent.                 |
| `remove_tag`           | `noteId`, `name`                                                                                | `{ noteId, name }`. Idempotent.                  |
| `export_note_markdown` | `id`                                                                                            | Plain Markdown text of the note.                  |

### Content format

All content I/O uses **Markdown**. The server round-trips through `lib/markdown/from-markdown.ts` / `lib/markdown/to-markdown.ts` (same converters used by the REST `/export.md` and `/import` endpoints). ProseMirror JSON is not exposed.

### Tool limits

- `list_notes` returns at most 500 rows (same cap as `GET /api/notes`).
- `title` max 300 chars, tag name max 40 chars (matches REST validation).

---

## Client Configuration

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "strawberry-notes": {
      "url": "https://notes.example.com/api/mcp",
      "headers": {
        "Authorization": "Bearer snb_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

Restart Claude Desktop. The Strawberry Notes tools should appear in the tool picker.

### Testing with `curl`

```bash
# List available tools
curl -s -X POST https://notes.example.com/api/mcp \
  -H "Authorization: Bearer snb_..." \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call list_notes
curl -s -X POST https://notes.example.com/api/mcp \
  -H "Authorization: Bearer snb_..." \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"list_notes","arguments":{"q":"grocery"}}}'
```

---

## Security Notes

- Tokens grant the same access as the user's password (no scopes in v1). Treat them accordingly; use one per client and revoke on compromise.
- Rate limiting is **not** implemented in the app. Put it in the reverse proxy if you expose the endpoint publicly (Caddy, nginx, Cloudflare).
- The endpoint does not participate in cookie-based auth — it cannot be triggered from a malicious page in the user's browser.
- Uploads (image attachments) are out of scope for MCP in v1 — they remain browser-only.

---

## Implementation Map

- Endpoint: [app/api/mcp/route.ts](../../app/api/mcp/route.ts)
- Server + tools: [lib/mcp/server.ts](../../lib/mcp/server.ts)
- Token helpers: [lib/auth/token.ts](../../lib/auth/token.ts)
- Bearer guard: [lib/auth/require-api.ts](../../lib/auth/require-api.ts)
- Token endpoints: [app/api/tokens/route.ts](../../app/api/tokens/route.ts), [app/api/tokens/[id]/route.ts](../../app/api/tokens/[id]/route.ts)
- Settings UI: [app/(app)/settings/page.tsx](../../app/(app)/settings/page.tsx), [components/app/settings/TokensSection.tsx](../../components/app/settings/TokensSection.tsx)
- Schema: `apiTokens` in [lib/db/schema.ts](../../lib/db/schema.ts); migration [drizzle/0002_api_tokens.sql](../../drizzle/0002_api_tokens.sql)
- Shared services reused by both REST and MCP:
  - [lib/notes/service.ts](../../lib/notes/service.ts) — notes CRUD + tag add/remove
  - [lib/notes/folder-service.ts](../../lib/notes/folder-service.ts) — folder list + create
  - [lib/notes/tag-service.ts](../../lib/notes/tag-service.ts) — tag list
