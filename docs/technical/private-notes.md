# Private Notes

[← Technical TOC](README.md)

User-facing name: **Private Notes**. Technical reality: per-note opt-in
end-to-end encryption with the bodies hidden from the MCP server, the web
clipper, the embedding worker, the full-text index, and the operator's DB.

This is not full-workspace E2EE — only the notes a user explicitly marks
private are encrypted. The plaintext notes still get FTS, semantic search,
wiki-link backlinks, MCP visibility, and clipper writes. That trade-off is
deliberate; the [roadmap](../leadership/roadmap.md) explains why
all-notes-E2EE-by-default is a different product.

---

## What's encrypted

| Field                 | Plaintext for private notes? |
| --------------------- | ---------------------------- |
| `notes.content`       | **No** — AES-256-GCM ciphertext, base64-encoded |
| `notes.contentText`   | Forced empty by the service layer on every private write |
| `notes.snippet`       | Forced empty                 |
| `notes.hasImage`      | Forced `false`               |
| `notes.contentEmbedding` | NULL (never embedded)     |
| `notes.title`         | Plaintext (so the list view + sidebar work) |
| `notes.folderId`      | Plaintext                    |
| `note_tags`           | Plaintext                    |
| `notes.pinned`, `trashedAt`, `createdAt`, `updatedAt` | Plaintext |

Title, folder placement, tags, and timestamps stay plaintext on purpose: the
list view, the sidebar, and the locked-overlay all need them to render
something useful before unlock. If you need title-level encryption, this
isn't the product for you — see the threat-model section.

---

## Crypto envelope

All primitives are WebCrypto-native. **Zero new runtime deps.**

```
passphrase     ─PBKDF2-SHA256─►  KEK_p ─wraps─► NMK ─AES-256-GCM─► note bodies
recovery code  ─PBKDF2-SHA256─►  KEK_r ─wraps─► NMK
```

**Parameters:**

- KDF: PBKDF2-HMAC-SHA-256, **600 000 iterations** (OWASP 2023). Argon2id is
  stronger but has no native WebCrypto; pulling in a WASM polyfill crosses
  the project's non-bloat line.
- Symmetric: AES-256-GCM, 12-byte random IV per write, 16-byte tag.
- Recovery code: 24 Crockford base32 chars in `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`
  groups (120 bits of entropy). I/L/O/U excluded; the normaliser coerces them
  back so users who mis-type still unlock.
- NMK (Note Master Key): 32 random bytes, generated once at setup. Same key
  is used directly as the AES-GCM key for every note — IV uniqueness is the
  reuse-resistance bound, and AES-GCM safely supports ~2^32 messages per key
  with random IVs (orders of magnitude beyond a personal notes workspace).

**Per-note ciphertext layout** (binary, base64 in JSON transport):

```
+--------+-----+-----------------+--------+
| (none) | IV  | AES-GCM ct      | tag    |
+--------+-----+-----------------+--------+
         12 B   variable          16 B
```

The version field is in the JSON metadata (`notes.encryption.v`), not in the
binary blob.

**Wrap envelope** (stored in `user_encryption.{passphrase,recovery}_wrap`):

```json
{
  "v": 1,
  "kdf": "PBKDF2-SHA256",
  "iters": 600000,
  "salt": "<base64 16 bytes>",
  "iv":   "<base64 12 bytes>",
  "ct":   "<base64 32 bytes NMK + 16 byte tag>"
}
```

The wrap operation is `AES-256-GCM(KEK, NMK)` with `AAD = "sn-private-notes-v1"`.
The AAD binds wrap blobs to this feature so they can't be misused as another
AES-GCM payload elsewhere.

---

## Threat model

### What this defends against

- **LLM exfil via MCP.** `list_notes`, `search_notes`, `search_semantic`,
  `get_note`, `get_backlinks`, `export_note_markdown` all pass
  `{ includePrivate: false }` to the underlying service. A bearer token
  sees no private rows and gets `not found` for any private note id.
- **Web clipper accidentally reading private notes.** Same bearer-token path
  as MCP; the clipper inherits the invisibility.
- **Casual operator inspection.** `SELECT title, content_text, snippet FROM
  notes` returns empty body cells for private rows; `SELECT content` is
  base64 with no decryption material on the server.
- **Plaintext in `pg_dump` and the workspace ZIP.** Private rows are
  ciphertext; the workspace export emits them as `.encrypted.json`
  envelopes alongside a top-level `README.txt`.
- **Plaintext FTS index.** Forcing `content_text = ''` on private writes
  means the existing generated `content_tsv` column is title-only for
  private notes — body keywords aren't indexable.

### What this does NOT defend against

- **A malicious operator silently swapping the JS bundle.** No
  server-rendered web app can defend against this — the server delivers the
  decryption code. Users with this threat model should run a desktop vault
  product (Standard Notes, Joplin with E2EE, Obsidian + a vault).
- **Memory inspection of the unlocked tab.** The session NMK is held as a
  non-extractable WebCrypto key, but a debugger / compromised browser
  extension can MITM the editor.
- **An attacker holding both the database AND either the passphrase or the
  recovery code.** Each secret independently unwraps the NMK — by design,
  for recovery.
- **Metadata leak.** Title, folder, tags, timestamps, `pinned`, presence
  of the note are all plaintext. The 🔒 badge in `list_notes` confirms a
  private note exists at id X.

The "does not defend" list also appears verbatim in the setup-flow modal —
truth in advertising > looking secure.

---

## Recovery semantics

- **Forgot passphrase, have recovery code:** unlock with the recovery code,
  then change the passphrase from Settings → Privacy → Change passphrase.
- **Forgot recovery code, have passphrase:** unlock with the passphrase,
  then regenerate the recovery code from Settings.
- **Forgot both:** the private notes are unrecoverable. Not by the operator,
  not by the user, not by anyone. The keys live only on the user's devices.
  Notes can be deleted manually from the editor (the row goes away; the
  ciphertext goes with it).

The setup-flow modal blocks the user from finishing without typing back the
last 4 chars of the recovery code, then explicitly checking "I have saved
this recovery code somewhere safe." The friction is deliberate.

---

## What's hidden from whom

| Surface              | Sees private titles? | Sees private bodies? |
| -------------------- | -------------------- | -------------------- |
| Browser session (owner) | Yes               | Yes (after unlock)   |
| MCP bearer token     | No                   | No                   |
| Web clipper bearer   | No                   | No                   |
| Operator with `psql` | Yes (titles plaintext) | No (ciphertext) |
| Operator with `pg_dump` backup | Yes        | No                   |
| Workspace ZIP export | Yes (in manifest)    | No (as `.encrypted.json`) |
| Embedding provider   | Never embedded       | Never embedded       |
| FTS / `to_tsquery`   | Title only           | No (content_text empty) |

---

## Implementation map

- **Schema:** `lib/db/schema.ts` — `userEncryption` table, `notes.encryption` jsonb column. Migration: `drizzle/0012_private_notes.sql`.
- **Crypto:** `lib/crypto/private-notes.ts` (WebCrypto). Tests: `lib/crypto/private-notes.test.ts`.
- **Service:** `lib/notes/service.ts` — `createNote` / `updateNote` private branches; `listNotes` / `getNote` `includePrivate` option. `lib/notes/encryption-service.ts` for the wrap material.
- **REST routes:** `app/api/private-notes/{setup,wrap,passphrase,recovery,route}.ts` (session-only, no bearer surface).
- **Browser store:** `lib/store/private-notes-store.ts` — in-memory NMK, auto-lock, BroadcastChannel cross-tab sync. Tests: `lib/store/private-notes-store.test.ts`.
- **Settings UI:** `components/app/settings/PrivateNotesSection.tsx` + the three modals (`PrivateNotesSetupModal`, `PrivateNotesUnlockModal`, `PrivateNotesRotateModal`).
- **Editor:** `components/app/Editor.tsx` — toolbar lock toggle, locked overlay with Unlock CTA, `decryptedContent` prop. `components/app/AppShell.tsx` orchestrates the encrypt-on-save / decrypt-on-load flow.
- **MCP gating:** `lib/mcp/server.ts` — every read tool passes `{ includePrivate: false }`. Test: `lib/mcp/server.test.ts`.
- **Web clipper gating:** `app/api/notes/search/semantic/route.ts` (and any future bearer-supporting read route) passes `{ includePrivate: auth.via === 'session' }`.

---

## Backups

Operators should also encrypt the Postgres data volume — see the
[Database at rest](deployment.md#database-at-rest) section in the deployment
docs. Private Notes protects bodies from MCP and casual operator inspection;
disk encryption protects everything else (including private-note metadata
and plaintext notes) from stolen disks and leaked backup files.
