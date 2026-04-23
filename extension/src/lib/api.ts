/**
 * Tiny wrapper around the Strawberry Notes REST surface used by the
 * extension. Every call authenticates with `Authorization: Bearer <token>`
 * from chrome.storage.local — we never persist tokens in chrome.storage.sync
 * (which syncs across devices via the browser profile) and we never log
 * them.
 */

export interface StoredConfig {
  serverUrl: string;
  token: string;
  folderId: string | null;
}

export interface FolderDTO {
  id: string;
  name: string;
  color: string;
  position: number;
  count: number;
}

export interface ImportResult {
  id: string;
  imported: number;
  ids: string[];
}

const STORAGE_KEY = 'strawberry-notes-clipper';

/** Read the persisted config. Returns defaults for missing fields. */
export async function loadConfig(): Promise<StoredConfig> {
  const raw = await chrome.storage.local.get(STORAGE_KEY);
  const saved = (raw[STORAGE_KEY] ?? {}) as Partial<StoredConfig>;
  return {
    serverUrl: saved.serverUrl ?? '',
    token: saved.token ?? '',
    folderId: saved.folderId ?? null,
  };
}

export async function saveConfig(patch: Partial<StoredConfig>): Promise<StoredConfig> {
  const current = await loadConfig();
  const next: StoredConfig = { ...current, ...patch };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

/** Normalize a user-typed server URL. Trim, strip trailing slashes, require protocol. */
export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export async function listFolders(cfg: Pick<StoredConfig, 'serverUrl' | 'token'>): Promise<FolderDTO[]> {
  const base = normalizeServerUrl(cfg.serverUrl);
  if (!base) throw new Error('Server URL is empty');
  if (!cfg.token) throw new Error('Token is empty');
  const res = await fetch(`${base}/api/folders`, {
    method: 'GET',
    headers: authHeaders(cfg.token),
    credentials: 'omit',
  });
  if (!res.ok) {
    const msg = await safeError(res);
    throw new Error(`GET /api/folders failed (${res.status}): ${msg}`);
  }
  return (await res.json()) as FolderDTO[];
}

export interface ClipPayload {
  markdown: string;
  title?: string;
  folderId?: string | null;
  tagNames?: string[];
  sourceUrl?: string;
}

export async function importMarkdown(
  cfg: Pick<StoredConfig, 'serverUrl' | 'token'>,
  payload: ClipPayload,
): Promise<ImportResult> {
  const base = normalizeServerUrl(cfg.serverUrl);
  if (!base) throw new Error('Server URL is empty');
  if (!cfg.token) throw new Error('Token is empty');
  const body = JSON.stringify({
    markdown: payload.markdown,
    title: payload.title,
    folderId: payload.folderId ?? null,
    tagNames: payload.tagNames ?? [],
    sourceUrl: payload.sourceUrl,
  });
  const res = await fetch(`${base}/api/notes/import`, {
    method: 'POST',
    headers: { ...authHeaders(cfg.token), 'Content-Type': 'application/json' },
    body,
    credentials: 'omit',
  });
  if (!res.ok) {
    const msg = await safeError(res);
    throw new Error(`POST /api/notes/import failed (${res.status}): ${msg}`);
  }
  const data = (await res.json()) as ImportResult;
  return data;
}

async function safeError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}
