# Deployment

[← Technical TOC](README.md)

Strawberry Notes ships as a Docker image plus a Postgres sidecar and a named volume for uploads. The canonical deployment is `docker compose up`.

- Dockerfile: `docker/Dockerfile`
- Entrypoint: `docker/entrypoint.sh`
- Compose file: `docker-compose.yml`
- Reference env: `.env.example`

---

## Image Build

Multi-stage Dockerfile:

1. **`deps`** — `node:20-alpine`. Copies `package.json` + lockfile, runs `npm ci`.
2. **`builder`** — reuses deps, copies source, runs `npm run build`. Produces `.next/standalone/` (enabled by `output: 'standalone'` in `next.config.ts`).
3. **`runner`** — minimal `node:20-alpine`:
   - non-root user `nextjs:1001`
   - copies `.next/standalone` + `.next/static` + `public`
   - copies Drizzle runtime modules + migrations so the entrypoint can run `drizzle-kit migrate`
   - uses `tini` as PID 1, then `entrypoint.sh`, then `node server.js`
   - `VOLUME /data` — uploads live here
   - `EXPOSE 3000`

---

## Entrypoint

`docker/entrypoint.sh`:

1. Parses `DATABASE_URL` → host + port.
2. `nc -z` loops until Postgres accepts connections (60 s timeout).
3. Runs `drizzle-kit migrate` — applies any pending migrations.
4. `exec "$@"` — replaces itself with the command (`node server.js`).

This means a fresh `docker compose up` on an empty DB volume boots into a fully-migrated schema. No separate `db:migrate` step.

---

## Compose Services

### `app`

- Build: `docker/Dockerfile`.
- Ports: `${APP_PORT:-3200}:3000` — host **3200**, container **3000**. (The dev server — `next dev -p 3200` — also uses 3200, keeping dev and prod consistent.)
- Volumes: `uploads:/data`.
- Depends on `postgres` (waits for the health check).
- Env from `.env` (see below).

### `postgres`

- `postgres:16-alpine`.
- User `strawberry`, password from `POSTGRES_PASSWORD` (default `strawberry`).
- Volume `pgdata:/var/lib/postgresql/data`.
- Health check: `pg_isready`.

### Volumes

- `pgdata` — database.
- `uploads` — user-uploaded images.

Both are named Docker volumes. On a `docker compose down -v` they are deleted; for real deployments, back them up (see below) or swap them for host bind mounts.

---

## Environment Variables

Required:

| Var             | Purpose                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`  | Full Postgres connection string (e.g. `postgres://strawberry:…@postgres:5432/strawberry`). |
| `AUTH_SECRET`   | 32+ bytes base64. `openssl rand -base64 32`. Signs the JWT session.     |

Optional (with defaults):

| Var               | Default                      | Purpose                                      |
| ----------------- | ---------------------------- | -------------------------------------------- |
| `AUTH_URL`        | `http://localhost:3200`      | Public URL; Auth.js uses it for callbacks.   |
| `APP_PORT`        | `3200`                       | Host port mapping (container stays at 3000). |
| `UPLOAD_DIR`      | `./data/uploads`             | Where attachments land on disk.              |
| `MAX_UPLOAD_MB`   | `10`                         | Per-file upload cap.                         |
| `POSTGRES_PASSWORD` | `strawberry`               | Compose default DB password.                 |

`.env.example` at the repo root documents the full set — copy it to `.env` before first boot.

---

## Reverse Proxy

The app never terminates TLS. Put it behind Caddy, nginx, Traefik, or Cloudflare.

Caddy example (one-liner equivalent):

```caddy
notes.example.com {
  reverse_proxy localhost:3200
}
```

When you do this, set `AUTH_URL=https://notes.example.com` in `.env` **before** starting the app; otherwise Auth.js redirects will target `http://localhost:3200` and break sign-in.

---

## Backups

**Postgres:**

```bash
docker compose exec postgres pg_dump -U strawberry strawberry > backup.sql
```

**Uploads:**

```bash
docker compose run --rm -v "$PWD:/backup" app \
  tar -czf /backup/uploads.tgz /data/uploads
```

Restore is the reverse of each: `psql < backup.sql` and `tar -xzf uploads.tgz` into the volume.

For anything beyond "my notebook", schedule the pair (they must be kept in step) with your normal backup tooling. There's no built-in backup scheduler.

---

## Upgrades

1. `git pull` on the deployment host.
2. `docker compose build --no-cache app` (forces a fresh npm install + build).
3. `docker compose up -d app` — the entrypoint will run any new migrations before starting.

Rollback: keep the previous image tag handy (`docker compose down && docker tag <old> strawberry-notes-app:latest && docker compose up -d`). Migrations are forward-only; a rollback after a schema change requires a DB restore.

---

## Common Pitfalls

- **Container binds to 3000, host binds to 3200.** Don't try to talk to the container on 3200.
- **`AUTH_URL` must match the public URL.** The most common sign-in failure is `AUTH_URL=http://localhost:3200` behind an HTTPS proxy.
- **Volumes persist on `compose down` but not on `compose down -v`.** Learn the difference before you run the second form in anger.
- **Service worker caches aggressively in prod.** After deploying a significant UI change, tell users to hard-reload once or bump the SW version string in `public/sw.js`.
