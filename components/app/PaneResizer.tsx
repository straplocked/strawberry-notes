'use client';

import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { PANE_BOUNDS } from '@/lib/design/accents';
import { useIsMobile } from '@/lib/hooks/use-is-mobile';
import { useUIStore } from '@/lib/store/ui-store';

export type PaneSide = 'sidebar' | 'list';

interface DragStart {
  x: number;
  startWidth: number;
}

const handleStyle: CSSProperties = {
  width: 6,
  flexShrink: 0,
  background: 'transparent',
  cursor: 'col-resize',
  alignSelf: 'stretch',
  // Tells the browser we own pinch / pan so touch laptops don't hijack
  // pointermove for scroll. Required for setPointerCapture to track.
  touchAction: 'none',
  zIndex: 1,
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function PaneResizer({ side }: { side: PaneSide }) {
  const isMobile = useIsMobile();
  const settings = useUIStore((s) => s.settings);
  const patchSettings = useUIStore((s) => s.patchSettings);
  const dragRef = useRef<DragStart | null>(null);

  if (isMobile) return null;

  const { min, max } = PANE_BOUNDS[side];
  const current = side === 'sidebar' ? settings.sidebarWidth : settings.noteListWidth;
  const apply = (next: number) => {
    const clamped = clamp(Math.round(next), min, max);
    patchSettings(side === 'sidebar' ? { sidebarWidth: clamped } : { noteListWidth: clamped });
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, startWidth: current };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (!start) return;
    const delta = e.clientX - start.x;
    apply(start.startWidth + delta);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = e.shiftKey ? 32 : 8;
    const delta = e.key === 'ArrowLeft' ? -step : step;
    apply(current + delta);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={side === 'sidebar' ? 'Resize sidebar' : 'Resize note list'}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={current}
      tabIndex={0}
      style={handleStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    />
  );
}
