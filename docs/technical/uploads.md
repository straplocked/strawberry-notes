# Uploads

[← Technical TOC](README.md)

Strawberry Notes stores user-uploaded images on the local filesystem (not S3, not Cloudflare R2). That keeps self-hosting one step — the only persistent state is Postgres + one volume.

- Storage primitives: `lib/storage.ts`
- Upload endpoint: `app/api/uploads/route.ts`
- Serve endpoint: `app/api/uploads/[id]/route.ts`
- DB row: `attachments` table (see [database.md](database.md))

---

## Storage Layout

- **Directory:** `UPLOAD_DIR` env var (default `./data/uploads`). Inside the container this maps to the `uploads` named volume mounted at `/data`.
- **Filename:** `<uuid>.<ext>` where `<uuid>` is `crypto.randomUUID()` and `<ext>` comes from the MIME type via `extForMime()`.
- **Original filename** is preserved in the DB (`attachments.filename`) for download disposition but never used on disk.

`ensureUploadsDir()` is called at the start of each upload so the directory exists on fresh deployments.

---

## Allowed Types

Whitelist (in `lib/storage.ts`):

| MIME              | Extension |
| ----------------- | --------- |
| `image/png`       | `.png`    |
| `image/jpeg`      | `.jpg`    |
| `image/webp`      | `.webp`   |
| `image/gif`       | `.gif`    |
| `image/svg+xml`   | `.svg`    |
| `image/avif`      | `.avif`   |

Anything else → `415 Unsupported Media Type`. There is no sniff-based detection; the handler trusts the browser-supplied MIME. This is acceptable because:

1. The served content-type is whatever was stored (so a mislabelled SVG can only render as the type the client declared, not as script by accident).
2. Served paths live under `/api/uploads/...`, not at a public-origin path, so there's no same-origin document scope to hijack.

If you ever accept non-image types (e.g. PDFs), add magic-byte sniffing before lifting the whitelist.

---

## Size Limit

- Config: `MAX_UPLOAD_MB` env var, default **10** MB.
- Parsed by `maxUploadBytes()`.
- Enforced after reading the form field; an over-size upload returns `413`.

---

## Upload Endpoint (`POST /api/uploads`)

Flow:

1. `requireUserId()` — `401` without session.
2. Parse `multipart/form-data`, pull the `file` field.
3. Validate MIME (`isAllowedMime()`) and size.
4. `crypto.randomUUID()` → storage filename; `writeFile` to `UPLOAD_DIR/<uuid>.<ext>`.
5. Insert `attachments` row (`userId`, `filename`, `mime`, `size`, `storagePath`).
6. Return `{ id, url: "/api/uploads/<id>" }`.

Note that `attachments.noteId` is **not set** at upload time. Association happens implicitly when the editor inserts the image node with `src="/api/uploads/<id>"`. An attachment without an associated note is not garbage-collected automatically in v1.

---

## Serve Endpoint (`GET /api/uploads/:id`)

Flow:

1. `requireUserId()` — `401` without session.
2. Look up `attachments` by id.
3. If no row, or `row.userId !== session.user.id`, return `404` (not `403`, to avoid leaking existence).
4. `readFile(row.storagePath)` — if the file is missing on disk, `404`.
5. Stream back with:
   - `content-type: <row.mime>`
   - `cache-control: private, max-age=3600`

Ownership check is per-request; there is no shared-access flow. Even "public" embedding of a note (not implemented in v1) would still require the viewer to be signed in.

---

## Operational Notes

- **Backup:** the `uploads` volume is plain files on disk. To snapshot, `tar` the directory:
  ```bash
  docker compose run --rm -v "$PWD:/backup" app tar -czf /backup/uploads.tgz /data/uploads
  ```
- **Restore:** extract into the volume before starting the container.
- **Orphan cleanup:** there is no built-in reaper. To find orphans (files on disk with no DB row, or DB rows with no file), compare `ls -1 /data/uploads | cut -d. -f1` against `SELECT id FROM attachments;`.
- **Migrating to object storage:** if/when the app outgrows local storage, `storagePath` is the only column to widen. `lib/storage.ts` is small on purpose so it can be swapped for an S3 client without touching the route handlers.
