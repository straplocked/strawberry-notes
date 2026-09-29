/**
 * Next.js server-boot hook (stable since Next 15; auto-invoked once when
 * the server starts, and included in the `.next/standalone` build).
 *
 * Warms the pgvector-availability cache (`lib/embeddings/availability.ts`)
 * and logs its result at boot, so operators find out immediately whether
 * semantic search is enabled instead of waiting for the first search
 * request or embedding-worker tick to trigger the check.
 *
 * Non-fatal by design: if the DB isn't reachable yet when this runs, the
 * check re-runs lazily (and logs then) on the first real use.
 */
export async function register(): Promise<void> {
  // Only the Node.js runtime has a Postgres pool — the edge runtime (used by
  // some middleware/route handlers) never needs this.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  try {
    const { isEmbeddingColumnAvailable } = await import('./lib/embeddings/availability');
    await isEmbeddingColumnAvailable();
  } catch (err) {
    console.error('[boot] pgvector availability check failed', err);
  }

  try {
    await logSetupCodeIfNeeded();
  } catch (err) {
    console.error('[boot] setup-code check failed', err);
  }
}

/**
 * Zero-config first run: when the instance has no users yet and is
 * reachable via first-party login (password auth on, proxy auth off), print
 * the one-time setup code an operator needs to complete /signup. The code
 * is deterministic (HMAC of AUTH_SECRET — see lib/auth/bootstrap.ts), so
 * there's nothing to persist; it just gets re-derived and re-logged on
 * every restart until the first admin account exists.
 */
async function logSetupCodeIfNeeded(): Promise<void> {
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) return;
  const { isSetupModeActive, computeSetupCode } = await import('./lib/auth/bootstrap');
  if (!(await isSetupModeActive())) return;
  const code = computeSetupCode(authSecret);
  console.log('[boot] ==================================================');
  console.log('[boot] No admin account yet. Visit /signup and enter:');
  console.log(`[boot]   setup code: ${code}`);
  console.log('[boot] ==================================================');
}
