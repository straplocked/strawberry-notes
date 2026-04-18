'use client';

import { create } from 'zustand';
import type { FolderView } from '../types';
import {
  DEFAULT_SETTINGS,
  type AccentId,
  type Density,
  type Settings,
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
    return { ...DEFAULT_SETTINGS, ...parsed };
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
  setTweaksOpen: (tweaksOpen) => set({ tweaksOpen }),
  patchSettings: (p) => {
    const next: Settings = { ...get().settings, ...p };
    persistSettings(next);
    applyThemeVars(next);
    set({ settings: next });
  },
}));

/** Called once on the client to hydrate settings from localStorage. */
export function hydrateSettingsFromStorage() {
  const s = loadSettings();
  applyThemeVars(s);
  useUIStore.setState({ settings: s });
}
