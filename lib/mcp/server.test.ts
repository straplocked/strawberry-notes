import { describe, it, expect, vi } from 'vitest';

vi.mock('../db/client', () => ({ db: {} }));

import { buildMcpServer } from './server';

describe('buildMcpServer', () => {
  it('constructs an MCP server without throwing', () => {
    const server = buildMcpServer('00000000-0000-0000-0000-000000000000');
    expect(server).toBeDefined();
    // McpServer exposes the underlying Server via a `server` property.
    expect((server as unknown as { server: unknown }).server).toBeDefined();
  });
});
