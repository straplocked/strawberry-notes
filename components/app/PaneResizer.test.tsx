import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { PaneResizer } from './PaneResizer';
import { DEFAULT_SETTINGS } from '@/lib/design/accents';
import { useUIStore } from '@/lib/store/ui-store';

vi.mock('@/lib/hooks/use-is-mobile', () => ({
  useIsMobile: () => false,
}));

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
  resetStore();
});

afterEach(() => {
  resetStore();
  window.localStorage.clear();
});

function makePointerEvent(type: string, init: { clientX: number; pointerId?: number }) {
  // jsdom doesn't ship a PointerEvent constructor with all the bits we need;
  // hand-roll one that React's synthetic-event layer is happy to forward.
  const e = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    clientX: number;
    pointerId: number;
    button: number;
    shiftKey: boolean;
  };
  e.clientX = init.clientX;
  e.pointerId = init.pointerId ?? 1;
  e.button = 0;
  e.shiftKey = false;
  return e;
}

describe('PaneResizer', () => {
  it('updates the corresponding width while dragging', () => {
    const { getByRole } = render(<PaneResizer side="sidebar" />);
    const handle = getByRole('separator') as HTMLDivElement;
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();
    handle.hasPointerCapture = vi.fn(() => true);

    fireEvent(handle, makePointerEvent('pointerdown', { clientX: 100 }));
    fireEvent(handle, makePointerEvent('pointermove', { clientX: 130 }));
    expect(useUIStore.getState().settings.sidebarWidth).toBe(232 + 30);

    fireEvent(handle, makePointerEvent('pointerup', { clientX: 130 }));
  });

  it('clamps sidebar width to [180, 360]', () => {
    const { getByRole } = render(<PaneResizer side="sidebar" />);
    const handle = getByRole('separator') as HTMLDivElement;
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();
    handle.hasPointerCapture = vi.fn(() => true);

    fireEvent(handle, makePointerEvent('pointerdown', { clientX: 100 }));
    fireEvent(handle, makePointerEvent('pointermove', { clientX: -1000 }));
    expect(useUIStore.getState().settings.sidebarWidth).toBe(180);

    fireEvent(handle, makePointerEvent('pointermove', { clientX: 5000 }));
    expect(useUIStore.getState().settings.sidebarWidth).toBe(360);
  });

  it('clamps list width to [240, 520]', () => {
    const { getByRole } = render(<PaneResizer side="list" />);
    const handle = getByRole('separator') as HTMLDivElement;
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();
    handle.hasPointerCapture = vi.fn(() => true);

    fireEvent(handle, makePointerEvent('pointerdown', { clientX: 100 }));
    fireEvent(handle, makePointerEvent('pointermove', { clientX: -1000 }));
    expect(useUIStore.getState().settings.noteListWidth).toBe(240);

    fireEvent(handle, makePointerEvent('pointermove', { clientX: 5000 }));
    expect(useUIStore.getState().settings.noteListWidth).toBe(520);
  });

  it('moves 8px per arrow key, 32px with shift', () => {
    const { getByRole } = render(<PaneResizer side="sidebar" />);
    const handle = getByRole('separator');

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(useUIStore.getState().settings.sidebarWidth).toBe(240);

    fireEvent.keyDown(handle, { key: 'ArrowLeft', shiftKey: true });
    expect(useUIStore.getState().settings.sidebarWidth).toBe(208);
  });

  it('exposes ARIA separator semantics with current value', () => {
    useUIStore.getState().patchSettings({ sidebarWidth: 250 });
    const { getByRole } = render(<PaneResizer side="sidebar" />);
    const handle = getByRole('separator');
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('aria-valuemin')).toBe('180');
    expect(handle.getAttribute('aria-valuemax')).toBe('360');
    expect(handle.getAttribute('aria-valuenow')).toBe('250');
  });
});
