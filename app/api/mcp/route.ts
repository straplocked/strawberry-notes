import { NextResponse } from 'next/server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { requireBearerUserId } from '@/lib/auth/require-api';
import { buildMcpServer } from '@/lib/mcp/server';

export const dynamic = 'force-dynamic';

async function handle(req: Request): Promise<Response> {
  const auth = await requireBearerUserId(req);
  if (!auth.ok) return auth.response;

  // Stateless: each request gets a fresh server + transport, replies as JSON.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = buildMcpServer(auth.userId);
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // Best-effort cleanup.
    server.close().catch(() => {});
  }
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET() {
  return NextResponse.json({ error: 'streaming not supported' }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'sessions not used' }, { status: 405 });
}
