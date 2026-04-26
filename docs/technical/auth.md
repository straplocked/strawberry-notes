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
| `POST /api/tokens` (issue access token) | 20 per signed-in user per hour, capacity 20  |

Limits are per-process, not global. Operators running multiple replicas should add an upstream limiter at the reverse proxy — this layer is defense-in-depth, not a substitute. The limiter keys on `X-Forwarded-For` first hop, then `X-Real-IP`, then a constant fallback; pass these headers through your proxy.

Denied calls return HTTP 429 with `{ error: "rate_limit_exceeded", retryAfterSec }` and a `Retry-After` header.

---

## Password Policy

- Minimum 8 characters (enforced server-side and by the CLI helpers).
- No complexity requirements.
- Hashed with `bcryptjs` at cost 10.

There is **no email-based self-service password reset** — the v1 recovery path is operator-driven:

```bash
docker compose exec app npm run user:reset -- alice@example.com
# prints a generated password; hand it to the user out-of-band.
# To set a specific password: npm run user:reset -- alice@example.com newpassword1
```

The CLI updates `users.passwordHash` for the matching email; existing JWT sessions remain valid until they expire. The same script is the recommended path for rotating an admin password.

The provisioning helpers live in `lib/auth/user-admin.ts` and are unit-tested; the wrappers in `scripts/create-user.ts` and `scripts/reset-password.ts` are tiny argv → call shells.

---

## Secrets

- **`AUTH_SECRET`** — 32+ bytes of base64 entropy; used to sign JWTs. Generate with `openssl rand -base64 32`. Must be set in `.env`; the server refuses to start without it.
- **`AUTH_URL`** — public URL where the app is served (e.g. `https://notes.example.com`). Auth.js uses this for callback-URL construction; mismatch causes sign-in redirects to fail.

Both are read in `lib/auth.ts` via Auth.js's built-in env handling. Do not commit either.
