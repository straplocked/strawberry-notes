export type AccentId = 'strawberry' | 'leaf' | 'jam' | 'cherry' | 'mint' | 'ink';

export interface Accent {
  id: AccentId;
  name: string;
  hex: string;
  ink: string;
  soft: string;
  softDark: string;
}

export const ACCENTS: readonly Accent[] = [
  {
    id: 'strawberry',
    name: 'Strawberry',
    hex: '#e33d4e',
    ink: '#b02537',
    soft: '#fde0e3',
    softDark: '#3a1a20',
  },
  {
    id: 'leaf',
    name: 'Leaf',
    hex: '#5fae6a',
    ink: '#3f8a4c',
    soft: '#e1f0e3',
    softDark: '#1f3324',
  },
  { id: 'jam', name: 'Jam', hex: '#a8324a', ink: '#7a1f33', soft: '#f6dde2', softDark: '#2f1219' },
  {
    id: 'cherry',
    name: 'Cherry',
    hex: '#c62828',
    ink: '#8f1a1a',
    soft: '#fadada',
    softDark: '#34100f',
  },
  {
    id: 'mint',
    name: 'Mint',
    hex: '#3faa89',
    ink: '#277a61',
    soft: '#d6ede5',
    softDark: '#112a23',
  },
  {
    id: 'ink',
    name: 'Ink blue',
    hex: '#3b5bdb',
    ink: '#1e3a9e',
    soft: '#e7ecff',
    softDark: '#1e2440',
  },
] as const;

export type Theme = 'dark' | 'light';
export type Density = 'dense' | 'balanced' | 'comfy';

export type SidebarSectionKey = 'library' | 'time' | 'folders' | 'tags';

export interface Settings {
  theme: Theme;
  accent: AccentId;
  density: Density;
  sidebarHidden: boolean;
  /** Desktop sidebar width in px. Mobile ignores this. */
  sidebarWidth: number;
  /** Desktop note-list width in px. Mobile ignores this. */
  noteListWidth: number;
  /** Collapsed top-level sidebar sections. `true` = collapsed. */
  sidebarSections: Record<SidebarSectionKey, boolean>;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  accent: 'strawberry',
  density: 'balanced',
  sidebarHidden: false,
  sidebarWidth: 232,
  noteListWidth: 300,
  sidebarSections: { library: false, time: false, folders: false, tags: false },
};

/** Min/max bounds the resize handles enforce. Source of truth for both
 * the runtime drag clamps and any docs / tests asserting bounds. */
export const PANE_BOUNDS = {
  sidebar: { min: 180, max: 360, default: 232 },
  list: { min: 240, max: 520, default: 300 },
} as const;

export function accentById(id: AccentId): Accent {
  return ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
}
