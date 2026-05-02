/**
 * Build-time feature flag gating the Private Notes UI surface. Set
 * `NEXT_PUBLIC_PRIVATE_NOTES=true` in `.env` to expose the Settings panel
 * + editor lock toggle. Server-side routes + crypto land regardless — only
 * the user-visible affordances are gated, so a partial rollout never strands
 * a user with an unmodifiable encrypted note.
 *
 * Defaults to `false` so PR 2 ships dark; the flag flips on in PR 3 once
 * MCP/clipper gating is in place.
 */
export const PRIVATE_NOTES_ENABLED =
  process.env.NEXT_PUBLIC_PRIVATE_NOTES === 'true' ||
  process.env.NEXT_PUBLIC_PRIVATE_NOTES === '1';
