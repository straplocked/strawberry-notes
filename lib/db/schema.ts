import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { InferSelectModel } from 'drizzle-orm';

/**
 * pgvector column. The dimensionality is configurable via `EMBEDDING_DIMS`
 * (see lib/embeddings/client.ts). Changing this value is a destructive
 * migration — see docs/technical/deployment.md for the re-embed procedure.
 *
 * Wire format: the `vector` type in Postgres reads/writes as a text literal
 * of the form `[0.1,0.2,...]`. We convert Float32Array/number[] → text on the
 * way in and parse on the way out.
 */
const VECTOR_DIMS = Number(process.env.EMBEDDING_DIMS ?? 1024) || 1024;

export const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return `vector(${VECTOR_DIMS})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    // pgvector returns `[1,2,3]`; strip brackets then split.
    const inner = value.replace(/^\[|\]$/g, '');
    if (inner.length === 0) return [];
    return inner.split(',').map(Number);
  },
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  // Nullable: OIDC-only and proxy-mode users have no local password.
  // The credentials provider rejects sign-in when this is null.
  passwordHash: text('password_hash'),
  // When `REQUIRE_EMAIL_CONFIRMATION` is set, signup creates the row with
  // `emailConfirmedAt = null`; the credentials provider rejects sign-in
  // until a confirm-email link has been clicked. Operator-created accounts
  // (`npm run user:create`) come pre-confirmed.
  emailConfirmedAt: timestamp('email_confirmed_at', { withTimezone: true }),
  // 'user' (default) | 'admin'. Admins can manage other users via /admin/users
  // and the `npm run user:promote` / `user:demote` CLIs. The first user in
  // the table (by createdAt ASC) is bootstrapped as admin in the migration;
  // on a fresh install the first sign-in auto-promotes when no admin exists.
  role: text('role').notNull().default('user'),
  // When non-null, the credentials provider rejects sign-in. Set/cleared
  // by an admin from /admin/users; never written by self-service flows.
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  // TOTP enrollment. Null secret = not enrolled. The credentials provider
  // short-circuits with an MFA ticket cookie when this is non-null; the
  // separate `totp` provider then exchanges the ticket + a verified code
  // for a session.
  totpSecret: text('totp_secret'),
  totpEnrolledAt: timestamp('totp_enrolled_at', { withTimezone: true }),
  // Single-use recovery codes — array of `{ hash, usedAt }` objects where
  // hash is bcrypt(code). Null until enrolled.
  totpRecoveryCodes: jsonb('totp_recovery_codes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// OIDC account links. One row per `(provider, subject)` — the IdP's stable
// `sub` claim is the only identifier we trust as a primary key into the
// external user. Email can change on the IdP side; subject cannot. Linking
// rules live in lib/auth/oidc-link.ts.
export const oidcAccounts = pgTable(
  'oidc_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Reserved for future multi-IdP. Defaults to 'oidc' for the single
    // configured issuer.
    provider: text('provider').notNull().default('oidc'),
    subject: text('subject').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => ({
    userIdx: index('oidc_accounts_user_idx').on(t.userId),
    providerSubjectUq: unique('oidc_accounts_provider_subject_uq').on(t.provider, t.subject),
  }),
);

// `parentId` references `folders.id` for self-nesting. `ON DELETE CASCADE`
// means deleting a parent folder removes the entire subtree of folders, and
// the existing `notes.folderId` FK (`ON DELETE SET NULL`) takes care of any
// notes inside those folders — they fall back to "All Notes (unfiled)".
// Cycle prevention is enforced in the service layer; Postgres has no native
// "no cycles in a recursive FK" check.
export const folders = pgTable(
  'folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => folders.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#e33d4e'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userFolderIdx: index('folders_user_idx').on(t.userId, t.position),
    parentIdx: index('folders_parent_idx').on(t.parentId),
  }),
);

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
    title: text('title').notNull().default(''),
    // ProseMirror JSON document
    content: jsonb('content').notNull().default(sql`'{"type":"doc","content":[]}'::jsonb`),
    // Flattened plain text, recomputed on save. Used for search + snippet.
    contentText: text('content_text').notNull().default(''),
    // Precomputed snippet (first non-empty prose line, max ~180 chars). Populated
    // alongside contentText so the note list can be served without touching JSONB.
    snippet: text('snippet').notNull().default(''),
    // Precomputed "does this note embed an image?" flag — same motivation as snippet.
    hasImage: boolean('has_image').notNull().default(false),
    pinned: boolean('pinned').notNull().default(false),
    trashedAt: timestamp('trashed_at', { withTimezone: true }),
    // Semantic-search columns. `contentEmbedding` is null until the embedding
    // worker populates it. `embeddingStale` is set to true on every content
    // edit so the worker can find notes that need (re-)embedding.
    contentEmbedding: vector('content_embedding'),
    embeddingStale: boolean('embedding_stale').notNull().default(true),
    // Private-Notes envelope. When non-null, `content` holds a base64 AES-GCM
    // ciphertext string (encrypted client-side) instead of ProseMirror JSON,
    // and `contentText` / `snippet` / `hasImage` / `contentEmbedding` are
    // forced empty server-side. The shape is `{ v: 1, iv: <base64-12-bytes> }`
    // — the wrapped Note Master Key lives in `user_encryption`. See
    // docs/technical/private-notes.md.
    encryption: jsonb('encryption'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userFolderIdx: index('notes_user_folder_idx').on(t.userId, t.folderId, t.updatedAt),
    userPinnedIdx: index('notes_user_pinned_idx').on(t.userId, t.pinned, t.updatedAt),
    userTrashedIdx: index('notes_user_trashed_idx').on(
      t.userId,
      t.trashedAt,
      t.updatedAt.desc(),
    ),
  }),
);

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userTagUq: unique('tags_user_name_uq').on(t.userId, t.name),
  }),
);

export const noteTags = pgTable(
  'note_tags',
  {
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.noteId, t.tagId] }),
    tagIdx: index('note_tags_tag_idx').on(t.tagId),
  }),
);

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    noteId: uuid('note_id').references(() => notes.id, { onDelete: 'set null' }),
    filename: text('filename').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    storagePath: text('storage_path').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('attachments_user_idx').on(t.userId),
    noteIdx: index('attachments_note_idx').on(t.noteId),
  }),
);

export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    tokenHash: text('token_hash').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('api_tokens_user_idx').on(t.userId),
    hashUq: unique('api_tokens_hash_uq').on(t.tokenHash),
  }),
);

// Wiki-style [[Title]] links between notes. `targetId` is null while the target
// title doesn't resolve to an existing note — when a note is created or its
// title changes, unresolved rows whose `targetTitle` matches the new title get
// filled in. `targetTitle` is stored lowercased for case-insensitive matching.
export const noteLinks = pgTable(
  'note_links',
  {
    sourceId: uuid('source_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id').references(() => notes.id, { onDelete: 'set null' }),
    targetTitle: text('target_title').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.sourceId, t.targetTitle] }),
    targetIdx: index('note_links_target_idx').on(t.targetId),
    titleIdx: index('note_links_title_idx').on(t.targetTitle),
  }),
);

// Email-confirmation tokens. Same shape as password_reset_tokens but a
// distinct table so the lifecycles don't tangle (a confirmation token can
// outlive a password reset, vice versa, and the rate-limit / pruning rules
// differ slightly). One outstanding row per user is the common case;
// re-issuing reaps stale rows for that user.
export const emailConfirmations = pgTable(
  'email_confirmations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('email_confirmations_user_idx').on(t.userId),
    hashUq: unique('email_confirmations_hash_uq').on(t.tokenHash),
  }),
);

// Per-user toggles for the transactional notifications fired on
// security-sensitive events (password change, token mint, webhook
// create, webhook dead-letter). All default ON because they're the
// "wait, that wasn't me" alert. Lazy-created on first read; absence
// is treated as "all defaults".
export const userEmailPreferences = pgTable('user_email_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordChanged: boolean('password_changed').notNull().default(true),
  tokenCreated: boolean('token_created').notNull().default(true),
  webhookCreated: boolean('webhook_created').notNull().default(true),
  webhookDeadLetter: boolean('webhook_dead_letter').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Self-service password-reset tokens. One row per outstanding request;
// tokens are hashed (SHA-256) and single-use. The raw token is emailed
// to the user and never stored. `expires_at` drives the validity check;
// `used_at` flips on consumption. Stale rows are reaped opportunistically
// by future issues (see lib/auth/password-reset.ts).
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('password_reset_tokens_user_idx').on(t.userId),
    hashUq: unique('password_reset_tokens_hash_uq').on(t.tokenHash),
  }),
);

// Per-user encryption material for the Private Notes feature. Lazy-created
// the first time a user enables Private Notes from Settings → Privacy. The
// server stores two AES-GCM-wrapped copies of the user's Note Master Key:
// one wrapped with a passphrase-derived KEK, one wrapped with a recovery-code-
// derived KEK. The server has neither secret — it can store and serve the
// wraps but not unwrap them. See docs/technical/private-notes.md.
//
// The wrap blobs are JSON of the form
//   { v, kdf: "PBKDF2-SHA256", iters, salt, iv, ct }
// where every byte field is base64-encoded.
export const userEncryption = pgTable('user_encryption', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Reserved for future format upgrades. Today only `1` is valid.
  version: integer('version').notNull().default(1),
  passphraseWrap: jsonb('passphrase_wrap').notNull(),
  recoveryWrap: jsonb('recovery_wrap').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Outbound webhooks. One row = one delivery target owned by one user.
// The `events` text[] holds the event names this webhook subscribes to
// (e.g. ['note.created', 'note.tagged']). The secret is shown once at
// creation time and stored as a SHA-256 hex hash, mirroring the
// api_tokens model. `consecutiveFailures` >= 5 trips `enabled = false`
// automatically — see lib/webhooks/delivery.ts.
export const webhooks = pgTable(
  'webhooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    url: text('url').notNull(),
    secretHash: text('secret_hash').notNull(),
    events: text('events')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    enabled: boolean('enabled').notNull().default(true),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
    lastErrorMessage: text('last_error_message'),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('webhooks_user_idx').on(t.userId),
  }),
);

export type User = InferSelectModel<typeof users>;
export type Folder = InferSelectModel<typeof folders>;
export type Note = InferSelectModel<typeof notes>;
export type Tag = InferSelectModel<typeof tags>;
export type Attachment = InferSelectModel<typeof attachments>;
export type ApiToken = InferSelectModel<typeof apiTokens>;
export type NoteLink = InferSelectModel<typeof noteLinks>;
export type Webhook = InferSelectModel<typeof webhooks>;
export type PasswordResetToken = InferSelectModel<typeof passwordResetTokens>;
export type EmailConfirmation = InferSelectModel<typeof emailConfirmations>;
export type UserEmailPreferences = InferSelectModel<typeof userEmailPreferences>;
export type UserEncryption = InferSelectModel<typeof userEncryption>;
export type OidcAccount = InferSelectModel<typeof oidcAccounts>;
