import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../design/accents';
import {
  applyLayoutVars,
  applyThemeVars,
  hydrateSettingsFromStorage,
  useUIStore,
} from './ui-store';

function resetStore() {
  useUIStore.setState({
    view: { kind: 'all' },
    activeNoteId: null,
    search: '',
    settings: DEFAULT_SETTINGS,
    tweaksOpen: false,
  });
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
  resetStore();
});

afterEach(() => {
  window.localStorage.clear();
  resetStore();
});

describe('useUIStore', () => {
  it('has sensible defaults', () => {
    const s = useUIStore.getState();
    expect(s.view).toEqual({ kind: 'all' });
    expect(s.activeNoteId).toBeNull();
    expect(s.search).toBe('');
    expect(s.settings).toEqual(DEFAULT_SETTINGS);
    expect(s.tweaksOpen).toBe(false);
  });

  it('clears search whenever the view changes', () => {
    useUIStore.getState().setSearch('strawberry');
    expect(useUIStore.getState().search).toBe('strawberry');
    useUIStore.getState().setView({ kind: 'folder', id: 'f1' });
    expect(useUIStore.getState().search).toBe('');
    expect(useUIStore.getState().view).toEqual({ kind: 'folder', id: 'f1' });
  });

  it('patches settings, persists to localStorage, and updates CSS vars', () => {
    useUIStore.getState().setAccent('mint');
    const persisted = JSON.parse(window.localStorage.getItem('sn-settings') ?? 'null');
    expect(persisted.accent).toBe('mint');
    expect(document.documentElement.style.getPropertyValue('--berry')).toBe('#3faa89');
  });

  it('toggles the sidebar via patchSettings', () => {
    expect(useUIStore.getState().settings.sidebarHidden).toBe(false);
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().settings.sidebarHidden).toBe(true);
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().settings.sidebarHidden).toBe(false);
  });

  it('applies the dark-mode soft variant when theme=dark', () => {
    useUIStore.getState().setAccent('leaf');
    useUIStore.getState().setTheme('dark');
    // leaf.softDark
    expect(document.documentElement.style.getPropertyValue('--berry-soft')).toBe('#1f3324');
    useUIStore.getState().setTheme('light');
    // leaf.soft
    expect(document.documentElement.style.getPropertyValue('--berry-soft')).toBe('#e1f0e3');
  });
});

describe('applyThemeVars', () => {
  it('sets data-theme and berry CSS custom properties', () => {
    applyThemeVars({ theme: 'light', accent: 'cherry' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.style.getPropertyValue('--berry')).toBe('#c62828');
    expect(document.documentElement.style.getPropertyValue('--berry-ink')).toBe('#8f1a1a');
  });
});

describe('applyLayoutVars', () => {
  it('sets pane-width CSS custom properties', () => {
    applyLayoutVars({ sidebarWidth: 250, noteListWidth: 380 });
    expect(document.documentElement.style.getPropertyValue('--sn-sidebar-width')).toBe('250px');
    expect(document.documentElement.style.getPropertyValue('--sn-list-width')).toBe('380px');
  });
});

describe('hydrateSettingsFromStorage', () => {
  it('reads previously persisted settings', () => {
    window.localStorage.setItem(
      'sn-settings',
      JSON.stringify({
        theme: 'light',
        accent: 'ink',
        density: 'comfy',
        sidebarHidden: true,
        sidebarWidth: 260,
        noteListWidth: 340,
        sidebarSections: { time: true, folders: false, tags: true },
      }),
    );
    hydrateSettingsFromStorage();
    expect(useUIStore.getState().settings).toEqual({
      theme: 'light',
      accent: 'ink',
      density: 'comfy',
      sidebarHidden: true,
      sidebarWidth: 260,
      noteListWidth: 340,
      sidebarSections: { time: true, folders: false, tags: true },
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.style.getPropertyValue('--sn-sidebar-width')).toBe('260px');
    expect(document.documentElement.style.getPropertyValue('--sn-list-width')).toBe('340px');
  });

  it('falls back to defaults when storage is empty', () => {
    hydrateSettingsFromStorage();
    expect(useUIStore.getState().settings).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to defaults when storage contains garbage', () => {
    window.localStorage.setItem('sn-settings', '{not json');
    hydrateSettingsFromStorage();
    expect(useUIStore.getState().settings).toEqual(DEFAULT_SETTINGS);
  });

  it('merges partial persisted settings with defaults', () => {
    window.localStorage.setItem('sn-settings', JSON.stringify({ accent: 'jam' }));
    hydrateSettingsFromStorage();
    const s = useUIStore.getState().settings;
    expect(s.accent).toBe('jam');
    expect(s.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(s.density).toBe(DEFAULT_SETTINGS.density);
    // Old payloads without the new width fields fall back to defaults.
    expect(s.sidebarWidth).toBe(DEFAULT_SETTINGS.sidebarWidth);
    expect(s.noteListWidth).toBe(DEFAULT_SETTINGS.noteListWidth);
    expect(s.sidebarSections).toEqual(DEFAULT_SETTINGS.sidebarSections);
  });

  it('merges partial sidebarSections with the default record', () => {
    // A persisted payload that only has *some* of the section keys (e.g.
    // an older version that pre-dates a new section) should fall back to
    // the default for any missing key, not produce an undefined-keyed
    // record that breaks `collapsedSections[k]` reads.
    window.localStorage.setItem('sn-settings', JSON.stringify({ sidebarSections: { tags: true } }));
    hydrateSettingsFromStorage();
    expect(useUIStore.getState().settings.sidebarSections).toEqual({
      time: false,
      folders: false,
      tags: true,
    });
  });

  it('drops retired section keys from older payloads', () => {
    // Pre-pin-library payloads carried a `library` flag. After Library was
    // pinned open we don't want that key leaking into the typed record;
    // hydrate should silently drop it instead of producing a record that
    // never matches DEFAULT_SETTINGS in equality checks.
    window.localStorage.setItem(
      'sn-settings',
      JSON.stringify({ sidebarSections: { library: true, time: true } }),
    );
    hydrateSettingsFromStorage();
    expect(useUIStore.getState().settings.sidebarSections).toEqual({
      time: true,
      folders: false,
      tags: false,
    });
  });
});

describe('toggleSidebarSection', () => {
  it('flips the requested section without disturbing the others', () => {
    expect(useUIStore.getState().settings.sidebarSections.tags).toBe(false);
    useUIStore.getState().toggleSidebarSection('tags');
    expect(useUIStore.getState().settings.sidebarSections).toEqual({
      time: false,
      folders: false,
      tags: true,
    });
    useUIStore.getState().toggleSidebarSection('tags');
    expect(useUIStore.getState().settings.sidebarSections.tags).toBe(false);
  });

  it('persists collapsed-section changes to localStorage', () => {
    useUIStore.getState().toggleSidebarSection('folders');
    const persisted = JSON.parse(window.localStorage.getItem('sn-settings') ?? 'null');
    expect(persisted.sidebarSections.folders).toBe(true);
  });
});
