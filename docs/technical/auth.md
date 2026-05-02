# Authentication

[← Technical TOC](README.md)

Auth.js v5 (`next-auth@5.0.0-beta.31`) with composable providers. Sessions are JWTs carried in a cookie; there is no DB-backed session table.

Four auth modes, controlled by env flags:

1. **Password** (default, on by default — `PASSWORD_AUTH=on`).
2. **TOTP/2FA** layered on top of password — per-user opt-in (`TOTP_ENABLED=on`).
3. **OIDC SSO** — generic single-issuer, e.g. Authentik / Authelia / Keycloak / Auth0 (`OIDC_ENABLED=on`).
4. **Proxy / forward-auth** — Strawberry's own auth is bypassed; the app trusts a username header injected by an upstream SSO proxy (`PROXY_AUTH=on`).

Modes are composable except for proxy: when `PROXY_AUTH=on` the login UI is hidden and the JWT cookie is ignored. Defaults preserve v1 behaviour exactly — set no flags and the instance behaves as password-only.

- Mode flags: `lib/auth/mode.ts`
- Config: `lib/auth.ts`
- API guard helper: `lib/auth/require.ts` (now wraps `auth()` with `getEffectiveSession()` to honour proxy mode)
- Signup endpoint: `app/api/auth/signup/route.ts`
- Sign-in page: `app/(auth)/login/page.tsx`
- TOTP routes: `app/api/auth/totp/{setup,enable,disable}/route.ts`
- Admin TOTP reset: `app/api/admin/users/[id]/reset-totp/route.ts`
- Security settings UI: `components/app/settings/SecuritySection.tsx`

---

## Providers

`lib/auth.ts::buildProviders()` mounts each provider conditionally on its env flag, so the providers array reflects the operator's configuration at process start. The default config (no flags) mounts Credentials only — identical to v1.

### Credentials (password)

Mounted when `PASSWORD_AUTH=on` (default). `authorize()`:

1. Looks up the user by lowercased email.
2. If no row, returns `null` → Auth.js responds `401`.
3. **If `passwordHash IS NULL` (OIDC-only or proxy-only user), returns `null`** — same generic shape as bad creds.
4. `bcryptjs.compare(password, user.passwordHash)`; mismatch → `null`.
5. If email confirmation is required and `email_confirmed_at IS NULL`, returns `null`.
6. If `users.disabled_at IS NOT NULL`, returns `null` (disabled state is not leaked).
7. **If `users.totp_secret IS NOT NULL`, mints a signed MFA ticket cookie + a non-httpOnly presence flag, then returns `null`** so the user is bounced back to `/login`. The form sees the presence flag and switches to the TOTP screen.
8. Otherwise: bootstrap admin if first user; return `{ id, email, role }`.

### TOTP (`id: 'totp'`)

Mounted alongside Credentials when `TOTP_ENABLED=on`. The form calls `signIn('totp', { code })` after a successful password attempt where TOTP was required. The provider:

1. Reads the signed `snb_mfa_ticket` cookie server-side (not from the form payload — keeps it httpOnly).
2. Verifies the ticket signature + expiry (5 min TTL, HMAC-SHA256 over `userId|exp` keyed by `AUTH_SECRET`).
3. Looks up the user; rejects on disabled or no-TOTP-secret.
4. If the code is 6 digits, verifies via `verifyTotpCode` (otplib, ±30s window).
5. Else treats the input as a recovery code: bcrypt-compare against the stored array, mark the matched index `usedAt = now()`.
6. On success, clear both cookies; return `{ id, email, role }`.

Why a second provider instead of "credentials with an optional TOTP field": Auth.js v5 collapses every authorize failure to `CredentialsSignin` — there's no way to surface "needs TOTP" vs "wrong password" to the client from a single provider. The two-provider pattern (password → ticket → totp) is the documented MFA recipe.

### OIDC (`id: 'oidc'`)

Mounted when `OIDC_ENABLED=on` AND `OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET` are all set. Generic — works with any RFC-compliant OIDC issuer (Authentik, Authelia, Keycloak, Auth0, Google, etc.). The button label comes from `OIDC_NAME` (default `'SSO'`).

The `signIn` callback (`lib/auth.ts` → `resolveOrLinkOidcUser` in `lib/auth/oidc-link.ts`) decides what to do with each sign-in:

| Situation | Decision |
|---|---|
| `oidc_accounts(provider, sub)` row exists | Attach userId; bump `lastLoginAt`. |
| No link, but a local user has the same email AND `email_verified=true` | Refuse, **unless** `OIDC_TRUST_EMAIL_FOR_LINKING=true` (account-takeover risk — explicit opt-in). |
| No link, no matching user, `OIDC_AUTO_PROVISION=true`, `email_verified=true` | JIT-create user (`passwordHash=null`, `emailConfirmedAt=now()`), insert link row, run admin-bootstrap, seed first-run content. |
| `email_verified=false` for any email-touching branch | Refuse. |
| Anything else | Refuse. |

The refusal returns `false` from the `signIn` callback; Auth.js redirects back to `/login?error=AccessDenied`. The error reason is intentionally not surfaced — we don't tell the IdP user whether the failure was about email verification, missing local account, or refusal-to-link.

Linking from inside the app (sign in with password, then "link Authentik to my account" in /settings) is **not** wired up in this iteration. The two paths in are: (a) be auto-provisioned with `OIDC_AUTO_PROVISION=true`, or (b) email-link with `OIDC_TRUST_EMAIL_FOR_LINKING=true` (after reading the threat model below).

### Proxy / trusted-header

When `PROXY_AUTH=on`, the entire above pipeline is bypassed. `getEffectiveSession()` in `lib/auth/require.ts`:

1. Checks the configured `PROXY_AUTH_SHARED_SECRET` against the `X-Forward-Auth-Secret` header. Constant-time compare; a missing or mismatched header → 401.
2. Reads the configured username header (`PROXY_AUTH_USER_HEADER`, default `x-authentik-username`).
3. Looks up (or JIT-creates) the local user via `getOrJitProvisionUser` in `lib/auth/proxy.ts`.
4. JIT inserts use `passwordHash=null`, `emailConfirmedAt=now()`. Admin-bootstrap fires once on the insert path.
5. An in-memory LRU cache (60s TTL, keyed by username header value) avoids hammering the DB on every request.
6. Returns `{ user: { id, email, role } }` — or null if disabled.

The JWT cookie is **intentionally ignored** when proxy mode is on. Otherwise an old session minted before the operator flipped to proxy mode would bypass the new gate.

### OIDC account-takeover threat model

If you set `OIDC_TRUST_EMAIL_FOR_LINKING=true` and your IdP allows admins to set arbitrary email addresses on user accounts, that IdP admin can take over any matching local account by signing in once. **Only enable this flag if** you control both ends of the trust relationship — typically a single self-hosted Authentik that you also operate, with email verification enforced.

### Mode bootstrap admin

Same rule as v1: if the table has no admin, the first row to be promoted gets it. The helper moved from inline in `authorize()` to `lib/auth/bootstrap.ts::ensureAdminBootstrap(userId)` so all three insert paths (credentials, OIDC, proxy JIT) call it identically. The query is `UPDATE users SET role='admin' WHERE id=$1 AND NOT EXISTS (... admin <> $1)` — idempotent; once any admin exists, every call no-ops.

---

## Session Strategy

`session: { strategy: 'jwt' }`.

Callbacks in `lib/auth.ts`:

- `jwt({ token, user })` — on sign-in, copies `user.id` and `user.role` into the token.
- `session({ session, token })` — copies `token.id` and `token.role` onto `session.user`.
- `authorized({ auth, request })` — declarative route gating:
  - `/admin` and its children require `auth` AND `role === 'admin'`.
  - `/notes` and its children require `auth`.
  - Public paths (`/login`, `/signup`, `/api/auth/*`, static assets) always pass.

TypeScript module augmentation in the same file adds `id: string` and `role: 'user' | 'admin'` to `Session['user']` and to the JWT, so call sites see them natively.

---

## Protection Model

### Pages

Protection is **per route group**, not middleware. The `(app)` layout (`app/(app)/layout.tsx`) runs on every request and calls `auth()`; no session → `redirect('/login')`.

This means:
- Adding a new protected page = dropping it under `app/(app)/`.
- Adding a new public page = dropping it under `app/(auth)/` (or at the root for shared shells).

### API routes

Each handler starts with:

```ts
const gate = await requireUserId();
if (!gate.ok) return gate.response;   // 401 JSON
const { userId } = gate;
```

`requireUserId()` is a thin wrapper over `auth()` that returns either `{ ok: true, userId }` or `{ ok: false, response: NextResponse }`. Every Drizzle query downstream is filtered by that `userId`.

**Cross-user access prevention** is enforced by that filter, not by row-level security. If you add a new resource (e.g. `boards`, `shares`), its handlers must include the `userId` filter — there is no generic interceptor.

---

## Signup Flow

Public signup is **gated by `ALLOW_PUBLIC_SIGNUP`** (default: `false`). On a closed instance the `/signup` page renders a 404 and `POST /api/auth/signup` returns 404 — accounts are provisioned by the operator from the CLI:

```bash
docker compose exec app npm run user:create -- alice@example.com
```

When `ALLOW_PUBLIC_SIGNUP=true`:

1. Client posts email + password to `POST /api/auth/signup`.
2. Server validates, hashes, inserts `users` row and a default `folders` row ("Journal").
3. Server returns `{ ok: true, userId }`.
4. Client immediately calls `signIn('credentials', { email, password, redirect: false })` to establish the session.
5. Client navigates to `/notes`.

The two-step (signup → signin) shape exists because Auth.js v5 credentials flows don't auto-sign-in on registration; the signup endpoint is a plain API route, not an Auth.js provider.

---

## Roles & Admin UI

Two roles: `user` (default) and `admin`. The role lives on `users.role` (text, NOT NULL, default `'user'`, CHECK constraint enforces the two values).

**Bootstrap rule.** Migration `0011` runs:

```sql
UPDATE users SET role = 'admin'
WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1);
```

so an existing instance promotes its first user to admin without operator action. Fresh installs hit the second guarantee in `lib/auth.ts`'s `authorize()` instead — the first sign-in that finds no admin in the table is auto-promoted (idempotent NOT EXISTS query). Either way, the operator's first account is the bootstrap admin.

**Disabled accounts.** `users.disabled_at` is a nullable timestamp set/cleared by an admin from `/admin/users`. Sign-in is rejected when it's set; existing JWT sessions continue until they expire — there is no live revocation in v1 (out-of-bounds for a self-hosted single-instance app; a fresh JWT after expiry is the next gate).

### Admin UI (`/admin/users`)

Server page at `app/(app)/admin/users/page.tsx` — calls `auth()`, falls back to `notFound()` for non-admins (404 over 403; we don't advertise the route's existence).

Client table renders: email, role, status (`active` / `disabled` / `unconfirmed`), created. Per-row actions:

- **Reset password** → `POST /api/admin/users/:id/reset-password` returns a freshly-generated password (one-time view in a copy-to-clipboard modal). Triggers `notifyPasswordChanged` so the user gets the standard "your password was changed" email if they have notifications on and SMTP is configured.
- **Promote / Demote** → `PATCH /api/admin/users/:id` with `{ role }`.
- **Disable / Enable** → `PATCH /api/admin/users/:id` with `{ disabled }`.
- **Delete** → `DELETE /api/admin/users/:id` (cascades through existing FKs).

Self-actions (the acting admin disabling, demoting, or deleting themselves) are blocked in both the UI and the API. The "last admin" guard is also enforced server-side: `setUserRole`, `setUserDisabled`, and `deleteUser` in `lib/auth/user-admin.ts` consult `countAdmins()` before applying any change that would leave zero admins. Errors map to HTTP statuses through `errorResponse()`: `not_found→404`, `email_taken / last_admin → 409`, `self_action → 403`, default → 400.

### Sidebar / mobile menu link

The sidebar footer renders the admin link only when `session.user.role === 'admin'` (passed down from `AppShell` via `useSession()`). The mobile gear-menu sheet shows an "Admin · users" row with the same gating. Regular users see neither, and `/admin/users` 404s for them.

### CLI

```bash
# Provision / reset / role management — operator-only, never via the web UI.
docker compose exec app npm run user:create  -- alice@example.com [password]
docker compose exec app npm run user:reset   -- alice@example.com [password]
docker compose exec app npm run user:promote -- alice@example.com
docker compose exec app npm run user:demote  -- alice@example.com
```

Promote / demote share `setUserRole` with the API, so the same "last admin" guard prevents demoting yourself into a zero-admin state from the shell. They emit a one-line confirmation (`[promote-user] alice@example.com is now an admin.`) and exit non-zero on `UserAdminError` so a wrapper script can branch on it.

---

## Rate Limiting

Auth-adjacent endpoints are protected by a per-process in-memory token-bucket limiter (`lib/http/rate-limit.ts`):

| Endpoint                                | Limit                                        |
| --------------------------------------- | -------------------------------------------- |
| `POST /api/auth/signup`                 | 5 per IP per hour, capacity 5                |
| `POST /api/auth/callback/credentials`   | 10 per IP per minute, capacity 10            |
| `POST /api/auth/forgot-password`        | 3 per IP per hour, capacity 3                |
| `POST /api/auth/reset-password`         | 10 per IP per hour, capacity 10              |
| `POST /api/auth/confirm-email`          | 10 per IP per hour, capacity 10              |
| `POST /api/auth/resend-confirmation`    | 3 per IP per hour, capacity 3                |
| `POST /api/tokens` (issue access token) | 20 per signed-in user per hour, capacity 20  |
| `POST /api/webhooks` (mint webhook)     | 20 per signed-in user per hour, capacity 20  |
| `POST /api/admin/users` (create user)   | 60 per acting admin per hour, capacity 60    |
| `GET /api/auth/totp/setup`              | 20 per signed-in user per hour, capacity 20  |
| `POST /api/auth/totp/enable`            | 10 per signed-in user per hour, capacity 10  |
| `POST /api/auth/totp/disable`           | 10 per signed-in user per hour, capacity 10  |

Limits are per-process, not global. Operators running multiple replicas should add an upstream limiter at the reverse proxy — this layer is defense-in-depth, not a substitute. The limiter keys on `X-Forwarded-For` first hop, then `X-Real-IP`, then a constant fallback; pass these headers through your proxy.

Denied calls return HTTP 429 with `{ error: "rate_limit_exceeded", retryAfterSec }` and a `Retry-After` header.

---

## Password Policy

- Minimum 8 characters (enforced server-side and by the CLI helpers).
- No complexity requirements.
- Hashed with `bcryptjs` at cost 10.

### Self-service password reset (v1.4)

Configure `SMTP_HOST` + `SMTP_FROM` (see [deployment.md](deployment.md#smtp--email-optional)) and the **Forgot password?** link on the sign-in page becomes functional:

1. User opens `/forgot-password`, enters their email, submits.
2. `POST /api/auth/forgot-password` is rate-limited (3/IP/hr). The route always returns 200 — the response shape never reveals whether the address is registered.
3. If the email matches a user, the server mints an `srt_<64-hex>` token, stores its SHA-256 hash with a 1-hour expiry in `password_reset_tokens`, and emails the user a link `${AUTH_URL}/reset-password?token=…`.
4. User clicks the link → `/reset-password` page → POSTs `{ token, password }` to `/api/auth/reset-password`.
5. The token row's `usedAt` is flipped inside the same transaction that updates `users.passwordHash`. Single-use; concurrent reuse loses the race.

Token-row lifecycle: stale rows for the user (expired or already used) are reaped opportunistically on every fresh issue, so there is no cron job. Existing JWT sessions remain valid through a reset — the user signs in afresh on their next visit.

When `SMTP_HOST` is unset the **Forgot password?** page still loads but explicitly tells the user the operator needs to run `npm run user:reset` (or to configure SMTP). The `POST /api/auth/forgot-password` response carries `{ ok: true, configured: false }` for that case so the page can render the operator-pathway hint without leaking which addresses exist.

### Email-confirmation on signup (v1.4)

Operator-level toggle, not per-user: setting `REQUIRE_EMAIL_CONFIRMATION=true` (default `false`) gates sign-in on a confirmation round-trip. The flow:

1. `POST /api/auth/signup` creates the row with `users.email_confirmed_at = null` and emails the user a `${AUTH_URL}/confirm-email?token=ecf_<64-hex>` link. The response carries `{ ok: true, confirmationRequired: true }` so the signup form shows a "check your inbox" panel instead of trying `signIn()`.
2. The credentials provider in `lib/auth.ts` rejects sign-in when `email_confirmed_at IS NULL` and confirmation is required. The rejection is indistinguishable from a wrong-password rejection — we don't leak whether the address exists or whether confirmation is the gate.
3. `/confirm-email?token=…` auto-POSTs to `/api/auth/confirm-email`; success flips `email_confirmed_at` inside the same transaction that marks the token used.
4. Lost the link? `/confirm-email` (without `?token=`) shows a resend form that hits `POST /api/auth/resend-confirmation` (3/IP/hr, no enumeration).

Tokens live in `email_confirmations` (parallels `password_reset_tokens` shape — single-use, 24-hour TTL, opportunistic reaping on each fresh issue). Operator-created accounts via `npm run user:create` are always pre-confirmed regardless of the env. **Implies SMTP must be configured** — without it the user can't receive the link and would be locked out of their own brand-new account; the operator should add `SMTP_HOST` first or leave `REQUIRE_EMAIL_CONFIRMATION=false`.

### Operator-driven reset (always available)

```bash
docker compose exec app npm run user:reset -- alice@example.com
# prints a generated password; hand it to the user out-of-band.
# To set a specific password: npm run user:reset -- alice@example.com newpassword1
```

The CLI updates `users.passwordHash` for the matching email; existing JWT sessions remain valid until they expire. Useful for instances that don't want SMTP, for emergencies, or for rotating an admin password.

The provisioning helpers live in `lib/auth/user-admin.ts` and are unit-tested; the wrappers in `scripts/create-user.ts` and `scripts/reset-password.ts` are tiny argv → call shells. Self-service token issue/consume lives in `lib/auth/password-reset.ts` and is also unit-tested.

---

## Secrets

- **`AUTH_SECRET`** — 32+ bytes of base64 entropy; used to sign JWTs. Generate with `openssl rand -base64 32`. Must be set in `.env`; the server refuses to start without it.
- **`AUTH_URL`** — public URL where the app is served (e.g. `https://notes.example.com`). Auth.js uses this for callback-URL construction; mismatch causes sign-in redirects to fail.

Both are read in `lib/auth.ts` via Auth.js's built-in env handling. Do not commit either.

When `AUTH_URL` is unset, the route handler at `app/api/auth/[...nextauth]/route.ts` rewrites every incoming `req.url` to use the user-facing origin — `X-Forwarded-Host` (with `X-Forwarded-Proto`) when present, otherwise the request's own `Host` header — before delegating to Auth.js. This is necessary because Next.js standalone (`output: "standalone"`) builds `req.url` from the runner's `HOSTNAME:PORT` env vars (e.g. `http://0.0.0.0:3000/...` inside Docker), and Auth.js uses `options.url.origin` everywhere it constructs an absolute URL — so without the rewrite, a LAN sign-in (`http://192.168.x.x:3200/login`) would bounce the browser to `http://0.0.0.0:3000/...` after credentials POST. Set `AUTH_URL` explicitly when the proxy in front strips `X-Forwarded-*`.

---

## Auth-mode env reference

All flags read at runtime; no rebuild required to flip a mode.

| Variable | Default | Effect |
|---|---|---|
| `PASSWORD_AUTH` | `true` | Mount the email/password Credentials provider. |
| `TOTP_ENABLED` | `false` | Mount the second `totp` Credentials provider; expose enrollment in `/settings`; show the 2FA column on `/admin/users`. |
| `OIDC_ENABLED` | `false` | Mount the OIDC provider — also requires the three `OIDC_*` creds below. |
| `OIDC_ISSUER` | — | Issuer URL (e.g. `https://auth.example.com/application/o/strawberry/`). |
| `OIDC_CLIENT_ID` | — | Public OIDC client id. |
| `OIDC_CLIENT_SECRET` | — | OIDC client secret. **Do not commit.** |
| `OIDC_NAME` | `SSO` | Button label on `/login`. |
| `OIDC_AUTO_PROVISION` | `false` | When set, JIT-create a local user on first OIDC sign-in (requires `email_verified=true`). |
| `OIDC_TRUST_EMAIL_FOR_LINKING` | `false` | When set, an OIDC sign-in whose email matches an existing local user auto-links instead of refusing. **Account-takeover risk** if you don't fully trust the IdP — see threat-model note above. |
| `PROXY_AUTH` | `false` | Bypass first-party auth entirely; trust a forward-auth header. Hides `/login`. |
| `PROXY_AUTH_USER_HEADER` | `x-authentik-username` | Username header — case-insensitive; lower-cased internally. |
| `PROXY_AUTH_EMAIL_HEADER` | `x-authentik-email` | Optional companion email header used for the local user row. |
| `PROXY_AUTH_SHARED_SECRET` | — | Required when `PROXY_AUTH=on`. The proxy must forward `X-Forward-Auth-Secret: <secret>` on every request; mismatch → 401. |
| `PROXY_AUTH_TRUSTED_IPS` | — | *Reserved for a future iteration; currently shared-secret is the only trust mechanism.* |
| `PROXY_AUTH_LOGOUT_URL` | — | Where the sign-out button points in proxy mode (e.g. `/outpost.goauthentik.io/sign_out`). Unset → button is hidden. |

Proxy mode only ever delegates to the upstream proxy for first-party login. `requireBearerUserId()` (the MCP/PAT path in `lib/auth/require-api.ts`) is **independent** of all of the above — Personal Access Tokens keep working under every mode combination.
