# Contributing to Strawberry Notes

Thanks for your interest. Strawberry Notes is a small project that tries to stay small. Here's how to help without accidentally making it big.

## Ground rules

- **Non-bloat.** If a feature can be done outside the app (separate tool, browser extension, CLI), it probably should be. When in doubt, open an issue before writing code.
- **Self-hostable first.** Anything that requires a paid third-party service to work is a non-starter for the core app. Optional integrations behind env vars are fine.
- **Stable tech choices.** We picked Next.js, Postgres, Drizzle, TipTap, Auth.js because they're well-trodden. Please don't swap the stack without a strong reason and a working prototype.
- **The design bundle is the spec.** Visual changes should match what the design files in the `chats/` history would have landed on — ask if you're unsure.

## Dev setup

```bash
npm install
cp .env.example .env.local
docker compose up -d postgres
npm run db:migrate
npm run dev
```

## Before opening a PR

1. `npm run typecheck`
2. `npm run lint`
3. `npm test`
4. If you touched visual code, spot-check both dark and light themes at 1280×820.
5. If you changed the DB schema, commit both `lib/db/schema.ts` and the generated migration.

## Commit style

We use [Conventional Commits](https://www.conventionalcommits.org):

```
feat(editor): add keyboard shortcut for checklists
fix(api): reject image uploads over MAX_UPLOAD_MB
docs: explain how to back up attachments
```

## Reporting bugs

Open a [GitHub Issue](./issues) with: what you did, what you expected, what happened, environment (self-hosted, browser, OS).

## Security issues

Please do **not** open a public issue for security bugs. See [SECURITY.md](SECURITY.md).
