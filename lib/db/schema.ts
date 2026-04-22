import { sql } from 'drizzle-orm';
import {
  boolean,
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
import type { InferSelectModel } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const folders = pgTable(
  'folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#e33d4e'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userFolderIdx: index('folders_user_idx').on(t.userId, t.position),
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

export type User = InferSelectModel<typeof users>;
export type Folder = InferSelectModel<typeof folders>;
export type Note = InferSelectModel<typeof notes>;
export type Tag = InferSelectModel<typeof tags>;
export type Attachment = InferSelectModel<typeof attachments>;
export type ApiToken = InferSelectModel<typeof apiTokens>;
