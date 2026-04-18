# Security Policy

If you find a security issue in Strawberry Notes, please email the maintainers privately before opening a public issue. We'll acknowledge within 3 days and coordinate a fix + disclosure timeline.

## Scope

In-scope:
- Authentication / authorization bypasses
- Cross-user data access (seeing another account's notes, folders, tags, or attachments)
- Stored XSS through note content, titles, filenames, or image metadata
- CSRF on state-changing endpoints
- SQL injection

Out of scope (handled by configuration, not code):
- Missing HTTPS (deploy behind a TLS-terminating reverse proxy)
- Attacks that require control of the server or database host

## Reporting

Open a private advisory on GitHub, or email the maintainer listed in the repository's `CODEOWNERS` (or `package.json` `author` field). Include steps to reproduce and the affected version.
