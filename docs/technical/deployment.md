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
| `AUTH_URL`           | *(auto-derived from request, falls back to `http://localhost:3200`)* | Public URL; Auth.js uses it for callbacks **and** is the override for outbound email links. When unset, email links (password reset, signup confirmation, notifications) auto-derive from the host the user is hitting (LAN IP, hostname, or `X-Forwarded-Host`). Set explicitly for production behind a TLS proxy. |
| `ALLOW_PUBLIC_SIGNUP`| `false`                    | When `false`, `/signup` 404s and accounts are bootstrapped via `npm run user:create`. Set to `true` only on instances where strangers may register. |
| `APP_PORT`           | `3200`                     | Host port mapping (container stays at 3000). |
| `UPLOAD_DIR`         | `./data/uploads`           | Where attachments land on disk.              |
| `MAX_UPLOAD_MB`      | `10`                       | Per-file upload cap.                         |
| `POSTGRES_PASSWORD`  | `strawberry`               | Compose default DB password.                 |
| `EMBEDDING_ENDPOINT` | *(unset)*                  | OpenAI-compatible base URL (`/v1`). Enables semantic search when set. |
| `EMBEDDING_MODEL`    | *(unset)*                  | Model id, e.g. `text-embedding-3-small`.     |
| `EMBEDDING_API_KEY`  | *(unset)*                  | Bearer token for the provider. Optional for local providers. |
| `EMBEDDING_DIMS`     | `1024`                     | Vector dim the `notes.content_embedding` column was provisioned for. Must match the provider's output dim. |
| `SMTP_HOST`          | *(unset)*                  | SMTP server. Empty disables email; self-service password reset falls back to "ask the operator". |
| `SMTP_PORT`          | `587`                      | STARTTLS by default; use 465 with `SMTP_SECURE=true` for implicit TLS. |
| `SMTP_USER`          | *(unset)*                  | Optional SMTP auth username.                  |
| `SMTP_PASS`          | *(unset)*                  | Optional SMTP auth password.                  |
| `SMTP_FROM`          | *(unset)*                  | `From:` address used on outbound mail. Required when `SMTP_HOST` is set. |
| `SMTP_SECURE`        | `false`                    | `true` forces implicit TLS at connect time.   |
| `PASSWORD_AUTH`      | `true`                     | Set to `false` to disable email/password sign-in (use OIDC-only or proxy-only deployments). |
| `TOTP_ENABLED`       | `false`                    | Enable per-user TOTP/2FA enrollment from Settings → Security. |
| `OIDC_ENABLED`       | `false`                    | Mount the OIDC provider (also requires the three `OIDC_*` creds below). |
| `OIDC_ISSUER`        | *(unset)*                  | OIDC issuer URL (e.g. `https://auth.example.com/application/o/strawberry/`). |
| `OIDC_CLIENT_ID`     | *(unset)*                  | OIDC client id. |
| `OIDC_CLIENT_SECRET` | *(unset)*                  | OIDC client secret. **Do not commit.** |
| `OIDC_NAME`          | `SSO`                      | Button label on the login page. |
| `OIDC_AUTO_PROVISION`| `false`                    | JIT-create local users on first OIDC sign-in (requires IdP `email_verified=true`). |
| `OIDC_TRUST_EMAIL_FOR_LINKING` | `false`          | Auto-link OIDC sign-ins to existing email-matching local users. **Account-takeover risk** if the IdP allows admin-set arbitrary emails — see [auth.md](auth.md#oidc-account-takeover-threat-model). |
| `PROXY_AUTH`         | `false`                    | Bypass first-party auth — trust a forward-auth header. Hides `/login`. |
| `PROXY_AUTH_USER_HEADER` | `x-authentik-username` | Header carrying the username injected by the proxy. |
| `PROXY_AUTH_EMAIL_HEADER` | `x-authentik-email`   | Optional companion email header. |
| `PROXY_AUTH_SHARED_SECRET` | *(unset)*            | Required when `PROXY_AUTH=on`. Proxy must forward `X-Forward-Auth-Secret: <secret>`; mismatch → 401. |
| `PROXY_AUTH_LOGOUT_URL` | *(unset)*               | Where the sign-out button points in proxy mode. Unset → button hidden. |

`.env.example` at the repo root documents the full set — copy it to `.env` before first boot.

### Auth modes (optional)

Default behaviour with no auth-related env vars set is identical to v1: email + password, single Credentials provider. Composable flags layer additional modes on top. See [auth.md](auth.md) for the full architecture.

#### Add 2FA / TOTP

```env
TOTP_ENABLED=true
```

Per-user opt-in. Each user enrolls themselves from **Settings → Security**, scans a QR code into any TOTP authenticator, saves 8 recovery codes, and confirms with a live code. Admins can clear an enrollment from `/admin/users → Reset 2FA` for users who lose their authenticator + recovery codes.

#### Add OIDC SSO (Authentik / Authelia / Keycloak / Auth0)

```env
OIDC_ENABLED=true
OIDC_ISSUER=https://auth.example.com/application/o/strawberry/
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
OIDC_NAME=Authentik
# optional, for greenfield onboarding:
OIDC_AUTO_PROVISION=true
```

Configure the redirect URI on the IdP side as `${AUTH_URL}/api/auth/callback/oidc`. The login page renders a "Sign in with {OIDC_NAME}" button alongside the password form.

Default linking policy is **strict**: an OIDC sign-in whose email matches an existing local user is refused. Either set `OIDC_TRUST_EMAIL_FOR_LINKING=true` (only when you trust the IdP's email-verification entirely) or rely on `OIDC_AUTO_PROVISION=true`.

#### Run behind Authentik forward-auth (proxy mode)

```env
PROXY_AUTH=true
PROXY_AUTH_SHARED_SECRET=<long random string>
PROXY_AUTH_USER_HEADER=x-authentik-username
PROXY_AUTH_EMAIL_HEADER=x-authentik-email
PROXY_AUTH_LOGOUT_URL=/outpost.goauthentik.io/sign_out
```

In Authentik:

1. Create a **Proxy Provider** (forward-auth, single application) for Strawberry.
2. Ensure `X-Authentik-Username` and `X-Authentik-Email` are forwarded to the upstream.
3. Have the proxy inject a custom header `X-Forward-Auth-Secret: <secret>` matching `PROXY_AUTH_SHARED_SECRET`. Without this header, every Strawberry request returns 401 — it is the only mechanism that distinguishes "request came from the proxy" from "client supplied the username header directly".
4. Outpost the application onto your Caddy / Traefik / nginx per the [Authentik forward-auth docs](https://goauthentik.io/docs/providers/proxy/server_nginx).

When `PROXY_AUTH=on`:

- `/login` redirects to `/notes` (the proxy already authed the user).
- The JWT cookie is **ignored** — every request is gated by the header check.
- Unknown usernames are JIT-provisioned (`passwordHash=null`, pre-confirmed). The first such user is auto-promoted to admin (same bootstrap rule as v1).
- Personal Access Tokens (`/api/mcp`) are unaffected — bearer auth is independent.

### Semantic search (optional)

Leave `EMBEDDING_ENDPOINT` empty to run without semantic search; `/api/notes/search/semantic` and the `search_semantic` MCP tool will return a clear "not configured" error, and everything else works unchanged.

To enable:

1. Pick a provider that speaks `POST /v1/embeddings` (OpenAI, Ollama, llama.cpp server, LM Studio, vLLM, …).
2. Pick a model and note its output dim. `EMBEDDING_DIMS` **must match**, or the column rejects writes.
3. Set the four env vars, `docker compose up -d`. The migration (`drizzle/0004_embeddings.sql`) enables the `vector` extension and provisions the column on first boot.
4. Run `npm run db:embed` (locally, against the deployed DB) to backfill existing notes. Fresh writes embed automatically via a lazy in-process worker.

Changing `EMBEDDING_DIMS` or swapping to a model with a different dim is a **destructive re-embed**: drop the index + column and re-run the migration. The old vectors are meaningless under a new dim.

### SMTP / email (optional)

Leave `SMTP_HOST` empty to run without email. The app boots, the **Forgot password?** link on `/login` still loads, and the page surfaces a "ask the operator to run `npm run user:reset`" message instead of pretending an email is on the way.

To enable self-service password reset:

1. Pick any SMTP relay — Postmark, Resend, SendGrid, Mailgun, AWS SES, your own postfix. They all expose SMTP; there is no per-provider adapter.
2. Set `SMTP_HOST`, `SMTP_FROM`, and (if your relay requires auth) `SMTP_USER` + `SMTP_PASS`. Default port is 587 with STARTTLS; for implicit-TLS submission set `SMTP_PORT=465` and `SMTP_SECURE=true`.
3. Decide on `AUTH_URL`. For LAN/dev access, leave it unset — email links auto-derive from the request host so links match whichever IP/hostname you're hitting. For production behind a TLS-terminating proxy, set it to the canonical public URL (`https://notes.example.com`) so links survive proxies that don't forward `X-Forwarded-Host`.
4. `docker compose up -d`. No migration to run; the schema for `password_reset_tokens` ships with the image.

Smoke test: open `/forgot-password`, submit your address, confirm the email arrives with a `${AUTH_URL}/reset-password?token=…` link, click through, set a new password, sign in.

The reset path is rate-limited at 3 requests per IP per hour to stop the surface from being weaponised as an inbox-spam vector. Tokens are one-hour single-use; expired or used rows are reaped opportunistically on each fresh issue.

#### Dev: catching mail with mailpit

For dev / homelab work you almost certainly don't want to send real email — point SMTP at a [mailpit](https://github.com/axllent/mailpit) catch-all instead. Mailpit accepts any SMTP submission, never relays anything outbound, and shows everything caught in a Gmail-like web UI on port 8025.

Two install options:

- **Sibling container on the same Docker host as the app** (development VM, single-machine setup). Easiest for "I just want to test this once" — does not ship with the production compose. Run alongside the app:

  ```bash
  docker run -d --name mailpit \
    --restart unless-stopped \
    -p 8025:8025 -p 1025:1025 \
    axllent/mailpit:latest
  ```

  Then in `.env`:

  ```
  SMTP_HOST=host.docker.internal   # Linux: use the host LAN IP instead
  SMTP_PORT=1025
  SMTP_FROM=strawberry@dev.local
  SMTP_SECURE=false
  ```

- **Standalone container on a homelab host** (Unraid, Synology, a dedicated mail-test box). Better long-term: production-shape parity with a real SMTP relay — the dev box's `SMTP_HOST` is a remote hostname, exactly the topology you'll use against Resend / Postmark / SES — plus any other homelab service (Sonarr, paperless-ngx, your own scripts) can share the same catch-all inbox.

  ```bash
  docker run -d --name mailpit \
    --restart unless-stopped \
    -p 8025:8025 -p 1025:1025 \
    -v /mnt/user/appdata/mailpit:/data \
    -e MP_DATABASE=/data/mailpit.db \
    -e MP_MAX_MESSAGES=5000 \
    axllent/mailpit:latest
  ```

  Then on the dev box, point `SMTP_HOST` at the homelab LAN IP:

  ```
  SMTP_HOST=192.168.1.77       # your homelab host
  SMTP_PORT=1025
  SMTP_FROM=strawberry@homelab.local
  SMTP_SECURE=false
  ```

Either way: open `/forgot-password`, submit, watch the message land at `http://<mailpit-host>:8025`, click the reset link to walk the full UI.

Mailpit accepts **unauthenticated submission by default** — leave `SMTP_USER` / `SMTP_PASS` unset. If you want SMTP AUTH on a shared homelab it supports `MP_SMTP_AUTH_FILE` and friends; see the upstream docs.

When you flip from mailpit to a real relay (Resend / Postmark / SES) for production, change four env vars and rebuild — there's no code path to update.

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

The signup, login, password-reset, and token-mint endpoints have built-in per-IP / per-user rate limits ([auth.md](auth.md#rate-limiting)). This is defense-in-depth on top of the proxy, not a substitute.

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

When you do this, set `AUTH_URL=https://notes.example.com` in `.env` **before** starting the app. Auth.js itself reads this directly for callback URLs — without it, sign-in redirects will target `http://localhost:3200` and break. Outbound email links honour `X-Forwarded-Host`/`X-Forwarded-Proto` when `AUTH_URL` is unset, but `AUTH_URL` is the safer pin: not all proxies forward those headers.

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
- **`AUTH_URL` must match the public URL when behind a proxy.** Auth.js reads it for callbacks; without it, sign-in redirects 404. Email links auto-derive from the request host when `AUTH_URL` is unset, so LAN/dev usually doesn't need to set it — but production behind HTTPS does.
- **Volumes persist on `compose down` but not on `compose down -v`.** Learn the difference before you run the second form in anger.
- **Service worker caches aggressively in prod.** After deploying a significant UI change, tell users to hard-reload once or bump the SW version string in `public/sw.js`.
