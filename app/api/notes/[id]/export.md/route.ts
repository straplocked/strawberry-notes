import { and, eq } from 'drizzle-orm';
import { requireUserId } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { notes } from '@/lib/db/schema';
import { docToMarkdown } from '@/lib/markdown/to-markdown';
import type { PMDoc } from '@/lib/types';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;

  const [n] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, a.userId)));
  if (!n) return new Response('Not found', { status: 404 });

  const md = `# ${n.title || 'Untitled'}\n\n${docToMarkdown(n.content as PMDoc)}`;
  const slug = (n.title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  return new Response(md, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="${slug || 'note'}.md"`,
    },
  });
}
