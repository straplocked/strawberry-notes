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

- `pgvector/pgvector:pg16` — stock Postgres 16 plus the `vector` extension, needed by semantic search. Drop-in compatible on an existing `pgdata` volume (the data directory layout is identical).
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

| Var                  | Default                    | Purpose                                      |
| -------------------- | -------------------------- | -------------------------------------------- |
| `AUTH_URL`           | `http://localhost:3200`    | Public URL; Auth.js uses it for callbacks.   |
| `ALLOW_PUBLIC_SIGNUP`| `false`                    | When `false`, `/signup` 404s and accounts are bootstrapped via `npm run user:create`. Set to `true` only on instances where strangers may register. |
| `APP_PORT`           | `3200`                     | Host port mapping (container stays at 3000). |
| `UPLOAD_DIR`         | `./data/uploads`           | Where attachments land on disk.              |
| `MAX_UPLOAD_MB`      | `10`                       | Per-file upload cap.                         |
| `POSTGRES_PASSWORD`  | `strawberry`               | Compose default DB password.                 |
| `EMBEDDING_ENDPOINT` | *(unset)*                  | OpenAI-compatible base URL (`/v1`). Enables semantic search when set. |
| `EMBEDDING_MODEL`    | *(unset)*                  | Model id, e.g. `text-embedding-3-small`.     |
| `EMBEDDING_API_KEY`  | *(unset)*                  | Bearer token for the provider. Optional for local providers. |
| `EMBEDDING_DIMS`     | `1024`                     | Vector dim the `notes.content_embedding` column was provisioned for. Must match the provider's output dim. |

`.env.example` at the repo root documents the full set — copy it to `.env` before first boot.

### Semantic search (optional)

Leave `EMBEDDING_ENDPOINT` empty to run without semantic search; `/api/notes/search/semantic` and the `search_semantic` MCP tool will return a clear "not configured" error, and everything else works unchanged.

To enable:

1. Pick a provider that speaks `POST /v1/embeddings` (OpenAI, Ollama, llama.cpp server, LM Studio, vLLM, …).
2. Pick a model and note its output dim. `EMBEDDING_DIMS` **must match**, or the column rejects writes.
3. Set the four env vars, `docker compose up -d`. The migration (`drizzle/0004_embeddings.sql`) enables the `vector` extension and provisions the column on first boot.
4. Run `npm run db:embed` (locally, against the deployed DB) to backfill existing notes. Fresh writes embed automatically via a lazy in-process worker.

Changing `EMBEDDING_DIMS` or swapping to a model with a different dim is a **destructive re-embed**: drop the index + column and re-run the migration. The old vectors are meaningless under a new dim.

> ⚠️ **Single-replica only.** The in-process embedding worker holds its "currently
> running?" flag in module memory. Running `docker compose up --scale app=N`
> with `N > 1` and embeddings enabled will not corrupt data, but each replica
> will independently re-embed the same notes — you spend `N×` the embedding API
> budget for no benefit. Either stay at one replica or run the worker out-of-band
> via `npm run db:embed` from a single host. The constraint is documented in
> `lib/embeddings/worker.ts`.

---

## Operator commands

Provisioning, password reset, and embedding backfill are run from inside the app container:

```bash
docker compose exec app npm run user:create -- alice@example.com           # create a user
docker compose exec app npm run user:create -- alice@example.com hunter2hunter   # …with a chosen password
docker compose exec app npm run user:reset -- alice@example.com            # reset a user's password
docker compose exec app npm run db:embed                                   # backfill embeddings
```

`user:create` and `user:reset` print the new password on stdout (generated when omitted). Hand it to the user out-of-band; existing JWT sessions remain valid through a reset.

---

## Public-launch hardening

If you intend to expose the instance to strangers (or hit Show HN), make sure the following are in place before opening the firewall:

- `AUTH_SECRET` is freshly generated and not the example value.
- `AUTH_URL` matches the canonical HTTPS URL.
- TLS is terminated at the reverse proxy.
- `ALLOW_PUBLIC_SIGNUP` is set deliberately — `false` for invite-only, `true` for open registration. Either is fine; the default is `false`.
- `X-Forwarded-For` is forwarded by the proxy so the in-process rate limiter can key on real client IPs.
- An offsite database backup is scheduled (see [Backups](#backups)).

The signup, login, and token-mint endpoints have built-in per-IP / per-user rate limits ([auth.md](auth.md#rate-limiting)). This is defense-in-depth on top of the proxy, not a substitute.

### Health endpoint

`GET /api/health` is a public, unauthenticated, non-rate-limited probe. It runs a 1-second-bounded `SELECT 1` against Postgres and returns `{ ok: true, db: 'up' }` (200) on success or `{ ok: false, db: 'down', error }` (503) on failure. Use it as the readiness probe for any reverse proxy, container orchestrator, or uptime monitor:

```bash
curl http://localhost:3200/api/health
# {"ok":true,"db":"up"}
```

`docker-compose.yml` declares an `app`-service `healthcheck` that calls this endpoint via Node's built-in `fetch` (alpine has no curl). `docker compose ps` reports `(healthy)` once the app is actually serving HTTP — pre-Tier 4 only the `postgres` service had a health probe, so app crashes were invisible to compose.

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

## Unraid

The image runs as **UID 1001 / GID 1001** (the non-root `nextjs` user from `docker/Dockerfile`). Unraid's default container UID is 99/100; that's fine when you stick to **named Docker volumes** (the supplied `docker-compose.yml` does), because Docker manages ownership inside `/var/lib/docker/volumes/...`.

If you switch to **host bind mounts** under `/mnt/user/appdata/strawberry-notes/` (the typical Unraid pattern, so backups land on the array), chown the host paths once before first boot:

```bash
mkdir -p /mnt/user/appdata/strawberry-notes/{uploads,pgdata}
chown -R 1001:1001 /mnt/user/appdata/strawberry-notes/uploads
chown -R 999:999  /mnt/user/appdata/strawberry-notes/pgdata    # postgres image runs as UID 999
```

Then point the volumes at those paths:

```yaml
volumes:
  - /mnt/user/appdata/strawberry-notes/uploads:/data
  # ...and on the postgres service:
  - /mnt/user/appdata/strawberry-notes/pgdata:/var/lib/postgresql/data
```

### Community-Applications-style env table

For an Unraid Docker template, the four fields you need are:

| Env var               | Required | Example                                              |
| --------------------- | :------: | ---------------------------------------------------- |
| `AUTH_SECRET`         |    ✅    | `openssl rand -base64 32` output                     |
| `AUTH_URL`            |    ✅    | `https://notes.your-domain.com` (or `http://<unraid-ip>:3200` if no proxy) |
| `DATABASE_URL`        |    ✅    | `postgres://strawberry:<password>@postgres:5432/strawberry` |
| `ALLOW_PUBLIC_SIGNUP` |          | `false` (default) — leave unset unless you want open signup |

Set the **WebUI** field on the Unraid template to `http://[IP]:[PORT:3200]/api/health` so the dashboard's green/red dot reflects real readiness, not just port-open.

### Embedding endpoint when Ollama is a sibling container

If you run Ollama as another Unraid container on the same docker network (e.g. `ollama` exposed on host port `11434`), set:

```bash
EMBEDDING_ENDPOINT=http://<unraid-lan-ip>:11434/v1
EMBEDDING_MODEL=mxbai-embed-large
EMBEDDING_DIMS=1024
EMBEDDING_API_KEY=                 # leave blank — Ollama doesn't require one
```

Use the LAN IP rather than `localhost` because the Strawberry Notes container's `localhost` is the container itself, not the host. If both containers join a shared Docker network, `http://ollama:11434/v1` works too — but the LAN-IP form is the safer default for a stock Unraid Docker setup.

After enabling, run the backfill once: `docker compose exec app npm run db:embed`.

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
