# Strawberry Notes

A simple, self-hostable notes app with an Apple Notes feel. Open source, PWA, runs in one Docker container next to Postgres.

![Strawberry red + leaf green accents, three-pane layout](public/icons/favicon.svg)

## Why

Because the best note app is the one you own. Strawberry Notes ships the features people actually use — folders, pinned notes, checklists, tags, images, search, markdown export — and nothing else. No AI. No collab. No cloud. Just your notes, on your server.

## Features (v1)

- Multi-user sign-in (email + password)
- Three-pane Apple-Notes-style layout (folders · list · editor)
- Rich text via TipTap: headings, **bold**/*italic*/~~strike~~, bullet and ordered lists, checklists, block quotes, dividers, inline images
- Drag/paste images — stored as local files on a Docker volume
- Tags, pinning, folders, soft-delete trash
- Full-text search backed by Postgres `tsvector` + GIN index
- Per-note Markdown export + `.md` upload import
- Installable PWA with offline read-only caching
- Dark/light themes, six accent palettes, density + sidebar toggles
- Works in one `docker compose up`
- **MCP server** — connect Claude Desktop or any MCP client to your notes; see [docs/technical/mcp.md](docs/technical/mcp.md)

## Quickstart

```bash
cp .env.example .env           # edit AUTH_SECRET (required)
openssl rand -base64 32        # → paste into AUTH_SECRET
docker compose up -d
open http://localhost:3200
```

Create an account on the signup page. Your data persists in two named volumes: `pgdata` (Postgres) and `uploads` (image attachments).

### PWA install

The app is installable from any modern browser — Chrome/Edge will show an install icon in the address bar. On iOS, open in Safari → Share → "Add to Home Screen". PWAs require HTTPS; for local dev the SW is disabled. For production, put Caddy/nginx/Cloudflare in front and terminate TLS there.

## Development

```bash
npm install
cp .env.example .env.local
# Option A: use compose just for Postgres
docker compose up -d postgres
# Option B: bring your own Postgres and set DATABASE_URL
npm run db:migrate
npm run dev
```

Scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | Turbopack dev server at :3200 |
| `npm run build` | Production build (standalone output) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest once |
| `npm run test:watch` | Vitest watch mode |
| `npm run db:generate` | Generate SQL migration from schema changes |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Drizzle Studio (visual DB browser) |

## Architecture

- **Framework**: Next.js 16 App Router + React 19, TypeScript, Turbopack
- **Database**: Postgres 16 via [Drizzle ORM](https://orm.drizzle.team)
- **Auth**: [Auth.js v5](https://authjs.dev) credentials provider (bcrypt, JWT session)
- **Editor**: [TipTap](https://tiptap.dev) (ProseMirror). Notes are stored as ProseMirror JSON with a flattened-text mirror column for search and snippets.
- **Search**: Postgres `tsvector` generated column + `websearch_to_tsquery`. No extra service.
- **File storage**: Local volume at `/data/uploads`, served through an authenticated Next route (ownership checked against the session user).
- **Offline**: Vanilla service worker at `public/sw.js` using stale-while-revalidate for note/folder/tag GETs. Writes require a network — v1 does not queue offline edits.
- **State**: Zustand for UI state, React Query for server cache.

Directory map:

```
app/               Next.js app router (pages + API routes + manifest)
components/        Sidebar, NoteList, Editor, Tweaks, icon set
lib/
  auth.ts         Auth.js config + augmented types
  db/             Drizzle schema + client
  editor/         ProseMirror helpers
  markdown/       PM ↔ Markdown round-trip
  notes/          Tag resolution helpers
  store/          Zustand UI store
  design/         Accent palette + settings types
  format.ts       Date formatter ported from the design
drizzle/          Generated SQL migrations
docker/           Dockerfile + entrypoint
```

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — (required) | Postgres connection string |
| `AUTH_SECRET` | — (required) | 32+ bytes of entropy; signs session cookies |
| `AUTH_URL` | `http://localhost:3200` | Used by Auth.js for callback URLs |
| `UPLOAD_DIR` | `./data/uploads` | Where attachment files live |
| `MAX_UPLOAD_MB` | `10` | Per-file upload cap |

## Deploying behind a reverse proxy

Example Caddy snippet:

```caddy
notes.example.com {
  reverse_proxy app:3000   # the container listens on 3000 internally regardless of APP_PORT
}
```

Remember to set `AUTH_URL=https://notes.example.com` so Auth.js issues correct callback URLs.

## Backup

- Database: `docker compose exec postgres pg_dump -U strawberry strawberry > backup.sql`
- Attachments: `docker run --rm -v strawberry-notes_uploads:/src -v $(pwd):/dst alpine tar czf /dst/uploads.tgz -C /src .`

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: open an issue for anything non-trivial, run `npm run typecheck && npm test` before a PR.

## License

[MIT](LICENSE). Use it, fork it, ship it.
