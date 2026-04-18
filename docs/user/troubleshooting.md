# Troubleshooting

[← User TOC](README.md)

Problems people actually hit, with the fix.

---

## "Can't sign in after deploying behind HTTPS"

**Symptom:** the sign-in form submits and bounces you back to `/login`, or redirects to `http://localhost:…` instead of your real URL.

**Cause:** `AUTH_URL` in the server's `.env` doesn't match the public URL.

**Fix:** set `AUTH_URL=https://your.real.domain` in `.env`, then `docker compose up -d app`. This is the single most common production misconfiguration.

---

## "Server won't start — 'AUTH_SECRET is required'"

**Cause:** no `AUTH_SECRET` set. The server refuses to boot without one.

**Fix:**
```bash
openssl rand -base64 32
```
Put that in `.env` as `AUTH_SECRET=...` and restart.

---

## "I forgot my password"

There is no self-serve password reset in v1. An operator with DB access can reset it:

```bash
# 1. Generate a new bcrypt hash on the host
node -e "console.log(require('bcryptjs').hashSync('new-password', 10))"

# 2. Update the row in Postgres
docker compose exec postgres psql -U strawberry -d strawberry -c \
  "UPDATE users SET \"passwordHash\" = '<paste-hash-here>' WHERE email = 'you@example.com';"
```

Then sign in with the new password.

---

## "Upload fails — 415 Unsupported Media Type"

**Cause:** the file isn't one of the allowed image formats.

**Allowed:** PNG, JPEG, WebP, GIF, SVG, AVIF.

**Fix:** convert the file, or use a supported format. Non-image attachments are not supported in v1.

---

## "Upload fails — 413 Payload Too Large"

**Cause:** file bigger than `MAX_UPLOAD_MB` (default 10 MB).

**Fix:** compress / resize the image, or (if you're the admin) raise `MAX_UPLOAD_MB` in `.env` and restart the app.

---

## "Images load slowly after I deploy an update"

**Cause:** the service worker's stale-while-revalidate cache is serving yesterday's list while the new one loads in the background.

**Fix:** hard-reload once (Shift+Reload or ⌘+Shift+R). Normal use will then hit fresh data.

If the issue is that a deploy changed the editor and stale UI keeps showing, bump the SW version in `public/sw.js` on the server so clients fetch a new service worker on their next visit.

---

## "I accidentally deleted a note"

If you used the **delete** (trash) action:
- Open the **Trash** view in the sidebar and click **Restore**.

If you used **Delete forever** from Trash:
- It's gone. There's no trash-for-the-trash. Restore from your latest Postgres backup if one exists.

---

## "Search doesn't find a note I know exists"

- Search excludes trashed notes — flip to the Trash view to check there.
- Queries shorter than 3 characters fall back to substring matching on title only.
- The full-text index is built on `contentText`; complex inline content (embedded tables, some exotic characters) may not tokenise the way you expect. Try simpler terms.

---

## "The app loads, but typing does nothing"

**Cause:** the editor is waiting for the note DTO to resolve; if the network request failed, there's no visible error in v1.

**Fix:**
1. Open DevTools → Network.
2. Look for a failed `GET /api/notes/<id>`.
3. If `401`: your session expired — sign in again.
4. If `500`: check the server logs (`docker compose logs -f app`).

---

## "Where is my data stored?"

- **Notes, folders, tags, user accounts:** Postgres — inside the `pgdata` Docker volume by default.
- **Images:** the `uploads` Docker volume (mounted at `/data/uploads` in the container).
- **Settings (theme, accent, density):** your browser's `localStorage`, not the server. They don't sync between devices.

Back both volumes up on the same schedule — see [../technical/deployment.md](../technical/deployment.md).

---

## Still stuck?

Open an issue on GitHub with:
- What you did
- What you expected
- What happened
- The app version / commit hash
- Relevant log lines from `docker compose logs app`

See [../../CONTRIBUTING.md](../../CONTRIBUTING.md) for the full bug-report template.
