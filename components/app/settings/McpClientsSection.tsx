'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';

const styles: Record<string, CSSProperties> = {
  section: {
    background: 'var(--surface)',
    border: '1px solid var(--hair)',
    borderRadius: 12,
    padding: 24,
    marginTop: 24,
  },
  h2: {
    fontFamily: 'var(--font-display)',
    fontSize: 20,
    fontWeight: 600,
    margin: 0,
    letterSpacing: '-0.01em',
  },
  help: {
    color: 'var(--ink-3)',
    fontSize: 13,
    lineHeight: 1.55,
    marginTop: 6,
  },
  tokenWrap: {
    marginTop: 16,
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  tokenInput: {
    flex: 1,
    background: 'var(--surface-2)',
    border: '1px solid var(--hair)',
    borderRadius: 8,
    padding: '8px 12px',
    color: 'var(--ink)',
    fontSize: 12,
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, monospace)',
  },
  btnGhost: {
    background: 'transparent',
    color: 'var(--ink-3)',
    border: '1px solid var(--hair)',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  clients: {
    marginTop: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  clientBlock: {
    border: '1px solid var(--hair)',
    borderRadius: 10,
    overflow: 'hidden',
  },
  clientHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    background: 'var(--surface-2)',
    borderBottom: '1px solid var(--hair)',
  },
  clientTitle: { fontSize: 13, fontWeight: 600 },
  clientPath: { fontSize: 11, color: 'var(--ink-3)' },
  codeWrap: { position: 'relative' },
  code: {
    margin: 0,
    padding: '14px 14px 14px 14px',
    background: 'var(--surface-2)',
    color: 'var(--ink)',
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, monospace)',
    fontSize: 12,
    lineHeight: 1.55,
    overflowX: 'auto',
    whiteSpace: 'pre',
  },
  copyBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    background: 'var(--surface)',
    color: 'var(--ink-3)',
    border: '1px solid var(--hair)',
    borderRadius: 6,
    padding: '3px 8px',
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  meta: { color: 'var(--ink-3)', fontSize: 11, marginTop: 10 },
};

const TOKEN_PLACEHOLDER = 'snb_YOUR_TOKEN_HERE';

interface ClientTemplate {
  id: string;
  title: string;
  // Where the config goes (shown as a small path under the title).
  path?: string;
  // `(url, token) => snippet`
  render: (url: string, token: string) => string;
}

const CLIENTS: ClientTemplate[] = [
  {
    id: 'claude-desktop',
    title: 'Claude Desktop (macOS / Windows)',
    path:
      'macOS: ~/Library/Application Support/Claude/claude_desktop_config.json · Windows: %APPDATA%\\Claude\\claude_desktop_config.json',
    render: (url, token) =>
      `{
  "mcpServers": {
    "strawberry-notes": {
      "url": "${url}",
      "headers": {
        "Authorization": "Bearer ${token}"
      }
    }
  }
}`,
  },
  {
    id: 'claude-code',
    title: 'Claude Code (CLI)',
    path: 'one-shot command — adds the server to your user-scope MCP config',
    render: (url, token) =>
      `claude mcp add --transport http strawberry-notes ${url} \\
  --header "Authorization: Bearer ${token}"`,
  },
  {
    id: 'cursor',
    title: 'Cursor',
    path: '~/.cursor/mcp.json (or .cursor/mcp.json in a project)',
    render: (url, token) =>
      `{
  "mcpServers": {
    "strawberry-notes": {
      "url": "${url}",
      "headers": {
        "Authorization": "Bearer ${token}"
      }
    }
  }
}`,
  },
  {
    id: 'curl',
    title: 'Any MCP client — quick test with curl',
    path: 'verify the endpoint works before wiring up a client',
    render: (url, token) =>
      `# List tools
curl -s -X POST ${url} \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
  },
];

export function McpClientsSection() {
  const [origin, setOrigin] = useState('');
  const [token, setToken] = useState('');
  const [revealToken, setRevealToken] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const url = useMemo(() => (origin ? `${origin}/api/mcp` : '/api/mcp'), [origin]);
  const tokenForSnippet = token.trim() || TOKEN_PLACEHOLDER;

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      // silently ignore — clipboard can fail in some browsers / contexts.
    }
  };

  return (
    <section style={styles.section}>
      <h2 style={styles.h2}>Connecting an AI assistant (MCP)</h2>
      <p style={styles.help}>
        The MCP endpoint is <code>{url}</code>. Paste a token below to pre-fill the snippets, or
        copy the templates and replace <code>{TOKEN_PLACEHOLDER}</code> yourself. The token input
        is local to this page — it is not sent anywhere.
      </p>

      <div style={styles.tokenWrap}>
        <input
          style={styles.tokenInput}
          type={revealToken ? 'text' : 'password'}
          placeholder="Paste token to inline it into the snippets below (optional)"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <button
          type="button"
          style={styles.btnGhost}
          onClick={() => setRevealToken((v) => !v)}
          aria-label={revealToken ? 'Hide token' : 'Show token'}
        >
          {revealToken ? 'Hide' : 'Show'}
        </button>
        {token && (
          <button type="button" style={styles.btnGhost} onClick={() => setToken('')}>
            Clear
          </button>
        )}
      </div>

      <div style={styles.clients}>
        {CLIENTS.map((c) => {
          const snippet = c.render(url, tokenForSnippet);
          return (
            <div key={c.id} style={styles.clientBlock}>
              <div style={styles.clientHeader}>
                <div>
                  <div style={styles.clientTitle}>{c.title}</div>
                  {c.path && <div style={styles.clientPath}>{c.path}</div>}
                </div>
              </div>
              <div style={styles.codeWrap}>
                <button
                  type="button"
                  style={styles.copyBtn}
                  onClick={() => copy(c.id, snippet)}
                  aria-label={`Copy ${c.title} snippet`}
                >
                  {copiedId === c.id ? 'Copied' : 'Copy'}
                </button>
                <pre style={styles.code}>{snippet}</pre>
              </div>
            </div>
          );
        })}
      </div>

      <p style={styles.meta}>
        Tokens carry the same access as your password. Revoke any you aren&rsquo;t using above.
      </p>
    </section>
  );
}
