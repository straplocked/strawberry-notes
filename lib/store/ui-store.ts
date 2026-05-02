'use client';

import { create } from 'zustand';
import type { FolderView } from '../types';
import {
  DEFAULT_SETTINGS,
  type AccentId,
  type Density,
  type Settings,
  type SidebarSectionKey,
  type Theme,
  accentById,
} from '../design/accents';

const SETTINGS_KEY = 'sn-settings';

function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    // Merge nested record fields too, so older payloads that pre-date a
    // section key still get the default for any missing key.
    const sidebarSections = {
      ...DEFAULT_SETTINGS.sidebarSections,
      ...(parsed.sidebarSections ?? {}),
    };
    return { ...DEFAULT_SETTINGS, ...parsed, sidebarSections };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persistSettings(s: Settings) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function applyThemeVars({ theme, accent }: Pick<Settings, 'theme' | 'accent'>) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  const a = accentById(accent);
  root.style.setProperty('--berry', a.hex);
  root.style.setProperty('--berry-ink', a.ink);
  root.style.setProperty('--berry-soft', theme === 'dark' ? a.softDark : a.soft);
}

/** Set the pane-width CSS vars Sidebar/NoteList consume so resize is
 * one source of truth between layout-init script and runtime settings. */
export function applyLayoutVars({
  sidebarWidth,
  noteListWidth,
}: Pick<Settings, 'sidebarWidth' | 'noteListWidth'>) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--sn-sidebar-width', `${sidebarWidth}px`);
  root.style.setProperty('--sn-list-width', `${noteListWidth}px`);
}

interface UIState {
  view: FolderView;
  activeNoteId: string | null;
  search: string;
  settings: Settings;
  tweaksOpen: boolean;

  setView: (v: FolderView) => void;
  setActiveNoteId: (id: string | null) => void;
  setSearch: (s: string) => void;
  setTheme: (t: Theme) => void;
  setAccent: (a: AccentId) => void;
  setDensity: (d: Density) => void;
  toggleSidebar: () => void;
  toggleSidebarSection: (key: SidebarSectionKey) => void;
  setTweaksOpen: (o: boolean) => void;
  patchSettings: (p: Partial<Settings>) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  view: { kind: 'all' },
  activeNoteId: null,
  search: '',
  settings: DEFAULT_SETTINGS,
  tweaksOpen: false,

  setView: (view) => set({ view, search: '' }),
  setActiveNoteId: (activeNoteId) => set({ activeNoteId }),
  setSearch: (search) => set({ search }),
  setTheme: (theme) => get().patchSettings({ theme }),
  setAccent: (accent) => get().patchSettings({ accent }),
  setDensity: (density) => get().patchSettings({ density }),
  toggleSidebar: () => get().patchSettings({ sidebarHidden: !get().settings.sidebarHidden }),
  toggleSidebarSection: (key) => {
    const current = get().settings.sidebarSections;
    get().patchSettings({
      sidebarSections: { ...current, [key]: !current[key] },
    });
  },
  setTweaksOpen: (tweaksOpen) => set({ tweaksOpen }),
  patchSettings: (p) => {
    const next: Settings = { ...get().settings, ...p };
    persistSettings(next);
    applyThemeVars(next);
    applyLayoutVars(next);
    set({ settings: next });
  },
}));

/** Called once on the client to hydrate settings from localStorage. */
export function hydrateSettingsFromStorage() {
  const s = loadSettings();
  applyThemeVars(s);
  applyLayoutVars(s);
  useUIStore.setState({ settings: s });
}
