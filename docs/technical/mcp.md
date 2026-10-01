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

**Scope (v1.6):** every token is `read` or `write`. New tokens default to **Read** in the Tokens UI — pick **Read & write** explicitly for a client that needs to create, edit, or clip. A `read` token's MCP server never registers the write tools (they're absent from `tools/list`, not present-but-rejected — see the Tool Reference below) and gets `403` from `POST /api/notes/import`. Every token that existed before this feature shipped (migration `0015_token_scope.sql`) kept `write` — the column defaults to `'write'`, so no existing client silently lost access.

---

## Tool Reference

All tools act on the authenticated user. Cross-user access is structurally impossible — the user id is bound to the server instance at request time and never comes from tool arguments.

The **Scope** column is which token scope (v1.6, see Authentication above) gets each tool registered at all. A `read` token's `tools/list` simply omits every row marked `write` — there is no call-and-get-rejected step, the tool doesn't exist for that session. See [Security Notes](#security-notes).

| Tool                   | Scope | Inputs                                                                                          | Result                                            |
| ---------------------- | ----- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `list_notes`           | read  | `folder?`, `tag?`, `q?`                                                                         | Array of note summaries (id, title, snippet, …). |
| `search_notes`         | read  | `query`                                                                                         | Same shape as `list_notes`, filtered by FTS (keyword / exact string). |
| `search_semantic`      | read  | `query`, `k?` (default 10, max 50)                                                              | Same shape as `list_notes` plus a `score` field (cosine similarity in [0, 1]). Requires an embedding provider (see [deployment.md](deployment.md)); errors cleanly if unset. |
| `get_note`             | read  | `id`                                                                                            | Full note **as Markdown** plus metadata.          |
| `create_note`          | write | `folderId?`, `title?`, `markdown?`, `tagNames?`                                                 | Created note summary.                             |
| `update_note`          | write | `id`, `title?`, `markdown?`, `folderId?`, `pinned?`, `tagNames?`, `trashed?`                    | Updated note summary.                             |
| `delete_note`          | write | `id`, `hard?` (default `false` — soft delete / Trash)                                           | `{ id, deleted: "soft" \| "hard" }`.             |
| `list_folders`         | read  | —                                                                                               | Array of folders with counts and `parentId` for nesting. |
| `create_folder`        | write | `name`, `color?` (`#rrggbb`), `parentId?` (uuid \| null)                                        | Created folder. `parentId` nests under another folder; omit / null for top-level. |
| `update_folder`        | write | `id`, `name?`, `color?`, `position?`, `parentId?`                                               | Updated folder. Errors with `parent-cycle` if the move would close a cycle. |
| `list_tags`            | read  | —                                                                                               | Array of tags with counts.                        |
| `add_tag`              | write | `noteId`, `name`                                                                                | `{ noteId, tagId }`. Idempotent.                 |
| `remove_tag`           | write | `noteId`, `name`                                                                                | `{ noteId, name }`. Idempotent.                  |
| `rename_tag`           | write | `id`, `name`                                                                                    | `{ id, merged }` — pure rename, or merge into an existing tag if the name collides. |
| `delete_tag`           | write | `id`                                                                                            | `{ id, deleted: true }`. Removes the tag from every note. |
| `get_backlinks`        | read  | `id`                                                                                            | Notes that link to this one via `[[Title]]`, newest-updated first. Useful for graph traversal. |
| `export_note_markdown` | read  | `id`                                                                                            | Plain Markdown text of the note.                  |

### Content format

All content I/O uses **Markdown**. The server round-trips through `lib/markdown/from-markdown.ts` / `lib/markdown/to-markdown.ts` (same converters used by the REST `/export.md` and `/import` endpoints). ProseMirror JSON is not exposed.

### Tool limits

- `list_notes` returns at most 500 rows (same cap as `GET /api/notes`).
- `search_semantic` returns at most 50 rows (`k` is clamped server-side).
- `title` max 300 chars, tag name max 40 chars (matches REST validation).

### When should an agent pick `search_semantic` over `search_notes`?

- **`search_notes` (FTS)** — exact strings, filenames, names, short phrases. Fast, zero external dependencies, always available.
- **`search_semantic`** — conceptual queries ("notes about burnout", "what did I say about pricing", "how did I solve the deploy hang last time"). Only works when the server operator has configured an embedding provider; the tool returns a descriptive error otherwise.

---

## Client Configuration

### Claude Desktop

Config location: macOS `~/Library/Application Support/Claude/claude_desktop_config.json` · Linux `~/.config/Claude/claude_desktop_config.json` · Windows `%APPDATA%\Claude\claude_desktop_config.json`.

**Recommended — wrap with `mcp-remote`.** Claude Desktop re-serializes this file on every launch, and several current builds drop entries whose shape they don't recognise (remote-URL servers get stripped on Linux/Windows). Wrapping the HTTP endpoint with [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) presents it as stdio, which Desktop preserves:

```json
{
  "mcpServers": {
    "strawberry-notes": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://notes.example.com/api/mcp",
        "--header",
        "Authorization:${SNB_TOKEN}"
      ],
      "env": {
        "SNB_TOKEN": "Bearer snb_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

`mcp-remote` substitutes `${SNB_TOKEN}` from `env` into the `Authorization` header, so the raw token stays out of `args`.

**Direct URL form** — works on builds that speak MCP Streamable HTTP natively; may be silently dropped on others:

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

Restart Claude Desktop after editing. The Strawberry Notes tools should appear in the tool picker.

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

- **Token scope (v1.6).** A token is `read` or `write`; a `write` token still grants everything a `read` token can do plus the write tools and `POST /api/notes/import`. There is no finer-grained scope (per-folder, per-tool, etc.) in v1.6 — it is a single read/write line. Use one token per client, pick the narrowest scope the client needs, and revoke on compromise.
- **Private Notes are invisible to MCP**, regardless of scope. Any note the user has marked Private (see [private-notes.md](private-notes.md)) is excluded from `list_notes` / `search_notes` / `search_semantic`, returns "not found" from `get_note` / `export_note_markdown`, and is omitted from `get_backlinks`. The bodies are AES-256-GCM ciphertext that the server cannot read; even if MCP wanted to surface them, there is nothing to surface.
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
- Schema: `apiTokens` in [lib/db/schema.ts](../../lib/db/schema.ts); migration [drizzle/0002_api_tokens.sql](../../drizzle/0002_api_tokens.sql); `scope` column added by migration [drizzle/0015_token_scope.sql](../../drizzle/0015_token_scope.sql) (`DEFAULT 'write' NOT NULL`, so every pre-existing token kept full access)
- Import-route scope check: [app/api/notes/import/route.ts](../../app/api/notes/import/route.ts)
- Shared services reused by both REST and MCP:
  - [lib/notes/service.ts](../../lib/notes/service.ts) — notes CRUD + tag add/remove
  - [lib/notes/folder-service.ts](../../lib/notes/folder-service.ts) — folder list + create
  - [lib/notes/tag-service.ts](../../lib/notes/tag-service.ts) — tag list
