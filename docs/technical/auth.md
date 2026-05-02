# Authentication

[← Technical TOC](README.md)

Auth.js v5 (`next-auth@5.0.0-beta.31`) with a credentials provider. Sessions are JWTs carried in a cookie; there is no DB-backed session table.

- Config: `lib/auth.ts`
- API guard helper: `lib/auth/require.ts`
- Signup endpoint: `app/api/auth/signup/route.ts`
- Sign-in page: `app/(auth)/login/page.tsx`

---

## Provider

Single **Credentials** provider. `authorize()`:

1. Looks up the user by lowercased email.
2. If no row, returns `null` → Auth.js responds `401`.
3. `bcryptjs.compare(password, user.passwordHash)`; mismatch → `null`.
4. Returns `{ id, email }`.

There is no OAuth provider, no magic-link provider, no SAML, no SSO. This is a deliberate v1 choice — see [leadership/roadmap.md](../leadership/roadmap.md).

---

## Session Strategy

`session: { strategy: 'jwt' }`.

Callbacks in `lib/auth.ts`:

- `jwt({ token, user })` — on sign-in, copies `user.id` into the token.
- `session({ session, token })` — copies `token.id` onto `session.user.id`.
- `authorized({ auth, request })` — declarative route gating:
  - `/notes` and its children require `auth`.
  - Public paths (`/login`, `/signup`, `/api/auth/*`, static assets) always pass.

TypeScript module augmentation in the same file adds `id: string` to `Session['user']` and to the JWT, so call sites see it natively.

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
