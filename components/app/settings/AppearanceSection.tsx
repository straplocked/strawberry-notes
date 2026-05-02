'use client';

import type { CSSProperties } from 'react';
import { ACCENTS, type AccentId, type Density } from '@/lib/design/accents';
import { useUIStore } from '@/lib/store/ui-store';

const styles: Record<string, CSSProperties> = {
  section: {
    background: 'var(--surface)',
    border: '1px solid var(--hair)',
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
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
    lineHeight: 1.5,
    marginTop: 6,
    marginBottom: 20,
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 16,
  },
  label: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--ink-3)',
    fontWeight: 600,
  },
  segments: {
    display: 'flex',
    gap: 4,
    padding: 4,
    background: 'var(--surface-2)',
    borderRadius: 8,
    border: '1px solid var(--hair)',
    width: 'fit-content',
  },
  swatches: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 32px)',
    gap: 8,
  },
};

function segBtnStyle(active: boolean): CSSProperties {
  return {
    padding: '6px 14px',
    border: 0,
    background: active ? 'var(--surface)' : 'transparent',
    borderRadius: 6,
    fontSize: 12.5,
    color: active ? 'var(--ink)' : 'var(--ink-2)',
    cursor: 'pointer',
    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
    fontWeight: active ? 600 : 500,
    minWidth: 64,
  };
}

function swatchStyle(color: string, active: boolean): CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: '2px solid ' + (active ? 'var(--ink)' : 'transparent'),
    cursor: 'pointer',
    background: color,
    boxShadow: active ? '0 0 0 2px var(--surface) inset' : 'none',
  };
}

export function AppearanceSection() {
  const { settings, setAccent, setDensity } = useUIStore();
  return (
    <section style={styles.section}>
      <h2 style={styles.h2}>Appearance</h2>
      <p style={styles.help}>
        Accent colour and list density. Theme (dark / light) lives in the sidebar
        footer on desktop and in the gear menu on mobile.
      </p>

      <div style={styles.row}>
        <span style={styles.label}>Accent</span>
        <div style={styles.swatches}>
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-label={a.name}
              title={a.name}
              style={swatchStyle(a.hex, settings.accent === a.id)}
              onClick={() => setAccent(a.id as AccentId)}
            />
          ))}
        </div>
      </div>

      <div style={styles.row}>
        <span style={styles.label}>Density</span>
        <div style={styles.segments}>
          {(['dense', 'balanced', 'comfy'] as Density[]).map((d) => (
            <button
              key={d}
              type="button"
              style={segBtnStyle(settings.density === d)}
              onClick={() => setDensity(d)}
            >
              {d[0].toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
