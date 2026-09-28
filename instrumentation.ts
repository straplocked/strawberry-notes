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
}
