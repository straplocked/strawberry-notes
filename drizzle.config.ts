import type { Config } from 'drizzle-kit';

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://strawberry:strawberry@localhost:5432/strawberry',
  },
  verbose: true,
  strict: true,
} satisfies Config;
