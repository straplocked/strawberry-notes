import { requireUserId } from '@/lib/auth/require';
import { exportAllToZipStream } from '@/lib/export/all';

export const runtime = 'nodejs';
// Exports can be large — don't try to cache them.
export const dynamic = 'force-dynamic';

/**
 * GET /api/export/all.zip[?includeTrash=1]
 *
 * Streams the user's entire workspace as a zip:
 *   notes/<folder>/<slug>-<shortId>.md (with YAML frontmatter)
 *   uploads/<name>-<shortId>.<ext>
 *   manifest.json
 *
 * Auth: Auth.js session cookie (same as every other REST route).
 */
export async function GET(req: Request): Promise<Response> {
  const a = await requireUserId();
  if (!a.ok) return a.response;

  const url = new URL(req.url);
  const includeTrash = url.searchParams.get('includeTrash') === '1';

  const stream = exportAllToZipStream(a.userId, { includeTrash });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `strawberry-notes-${stamp}.zip`;

  return new Response(stream, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
