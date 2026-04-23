/**
 * Popup controller. Loads config, renders settings + folder picker, and
 * drives the two clip actions.
 *
 * No tokens ever hit console.log — errors print only status codes / text.
 */

import {
  importMarkdown,
  listFolders,
  loadConfig,
  normalizeServerUrl,
  saveConfig,
  type FolderDTO,
  type StoredConfig,
} from '../lib/api';

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

const els = {
  settingsPanel: $('settings'),
  serverUrl: $<HTMLInputElement>('server-url'),
  token: $<HTMLInputElement>('token'),
  saveSettings: $<HTMLButtonElement>('save-settings'),
  testConn: $<HTMLButtonElement>('test-connection'),
  settingsStatus: $('settings-status'),
  toggleSettings: $<HTMLButtonElement>('toggle-settings'),

  clipPanel: $('clip'),
  folderSelect: $<HTMLSelectElement>('folder-select'),
  tags: $<HTMLInputElement>('tags'),
  clipPage: $<HTMLButtonElement>('clip-page'),
  clipSelection: $<HTMLButtonElement>('clip-selection'),
  clipStatus: $('clip-status'),
};

function setStatus(el: HTMLElement, text: string, kind: 'ok' | 'err' | '' = ''): void {
  el.textContent = text;
  el.classList.remove('ok', 'err');
  if (kind) el.classList.add(kind);
}

function renderFolders(folders: FolderDTO[], selectedId: string | null): void {
  els.folderSelect.innerHTML = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = '\u2014 no folder \u2014';
  els.folderSelect.appendChild(none);
  for (const f of folders) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.count > 0 ? `${f.name} (${f.count})` : f.name;
    if (selectedId && f.id === selectedId) opt.selected = true;
    els.folderSelect.appendChild(opt);
  }
}

async function refreshFolders(cfg: StoredConfig): Promise<void> {
  if (!cfg.serverUrl || !cfg.token) {
    renderFolders([], null);
    return;
  }
  try {
    const folders = await listFolders(cfg);
    renderFolders(folders, cfg.folderId);
    setStatus(els.settingsStatus, `Connected (${folders.length} folders).`, 'ok');
  } catch (err) {
    renderFolders([], null);
    setStatus(els.settingsStatus, describe(err), 'err');
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function bootstrap(): Promise<void> {
  const cfg = await loadConfig();
  els.serverUrl.value = cfg.serverUrl;
  els.token.value = cfg.token;
  // If the user has no server configured yet, leave settings expanded.
  // Otherwise the ready-to-clip panel takes focus.
  if (cfg.serverUrl && cfg.token) {
    els.settingsPanel.classList.add('hidden');
  }
  await refreshFolders(cfg);
}

els.toggleSettings.addEventListener('click', () => {
  els.settingsPanel.classList.toggle('hidden');
});

els.saveSettings.addEventListener('click', async () => {
  const serverUrl = normalizeServerUrl(els.serverUrl.value);
  const token = els.token.value.trim();
  if (!serverUrl) return setStatus(els.settingsStatus, 'Server URL required.', 'err');
  if (!token) return setStatus(els.settingsStatus, 'Token required.', 'err');
  await saveConfig({ serverUrl, token });
  const cfg = await loadConfig();
  els.serverUrl.value = cfg.serverUrl;
  setStatus(els.settingsStatus, 'Saved.', 'ok');
  await refreshFolders(cfg);
});

els.testConn.addEventListener('click', async () => {
  const cfg: StoredConfig = {
    serverUrl: normalizeServerUrl(els.serverUrl.value),
    token: els.token.value.trim(),
    folderId: null,
  };
  if (!cfg.serverUrl || !cfg.token) {
    return setStatus(els.settingsStatus, 'Fill in server URL and token first.', 'err');
  }
  setStatus(els.settingsStatus, 'Testing…');
  try {
    const folders = await listFolders(cfg);
    setStatus(els.settingsStatus, `OK — ${folders.length} folders.`, 'ok');
    renderFolders(folders, null);
  } catch (err) {
    setStatus(els.settingsStatus, describe(err), 'err');
  }
});

els.folderSelect.addEventListener('change', async () => {
  const folderId = els.folderSelect.value || null;
  await saveConfig({ folderId });
});

async function clip(mode: 'page' | 'selection'): Promise<void> {
  const cfg = await loadConfig();
  if (!cfg.serverUrl || !cfg.token) {
    return setStatus(els.clipStatus, 'Configure server + token first.', 'err');
  }
  setStatus(els.clipStatus, mode === 'page' ? 'Clipping page…' : 'Clipping selection…');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return setStatus(els.clipStatus, 'No active tab.', 'err');

  // Inject the content script on demand. Manifest does not auto-inject it;
  // this way we only touch the page when the user actually clicks a button.
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/clip.js'],
    });
  } catch (err) {
    return setStatus(els.clipStatus, `Cannot inject into this page: ${describe(err)}`, 'err');
  }

  let clip: {
    ok: true;
    markdown: string;
    title: string;
    url: string;
  } | { ok: false; error: string };
  try {
    clip = await chrome.tabs.sendMessage(tab.id, { type: 'snb/clip', mode });
  } catch (err) {
    return setStatus(els.clipStatus, `Clip failed: ${describe(err)}`, 'err');
  }
  if (!clip || !clip.ok) {
    return setStatus(els.clipStatus, clip?.error ?? 'Clip failed.', 'err');
  }
  if (!clip.markdown || clip.markdown.trim().length === 0) {
    return setStatus(els.clipStatus, 'Nothing to clip (empty result).', 'err');
  }

  const tagNames = els.tags.value
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  try {
    const result = await importMarkdown(cfg, {
      markdown: clip.markdown,
      title: clip.title,
      folderId: cfg.folderId,
      tagNames,
      sourceUrl: clip.url,
    });
    setStatus(els.clipStatus, `Saved \u2713 (id ${result.id.slice(0, 8)}…)`, 'ok');
  } catch (err) {
    setStatus(els.clipStatus, describe(err), 'err');
  }
}

els.clipPage.addEventListener('click', () => void clip('page'));
els.clipSelection.addEventListener('click', () => void clip('selection'));

void bootstrap();
