'use client';

import type { CSSProperties } from 'react';
import { IconSidebar, IconX } from '@/components/icons';
import { ACCENTS, type AccentId, type Density, type Theme } from '@/lib/design/accents';
import { useUIStore } from '@/lib/store/ui-store';
import { useIsMobile } from '@/lib/hooks/use-is-mobile';

const panelStyle: CSSProperties = {
  position: 'fixed',
  right: 20,
  bottom: 20,
  zIndex: 50,
  width: 280,
  background: 'var(--surface)',
  color: 'var(--ink)',
  border: '1px solid var(--hair)',
  borderRadius: 14,
  boxShadow: '0 20px 50px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.06)',
  fontSize: 12,
  overflow: 'hidden',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 14px',
  borderBottom: '1px solid var(--hair)',
  background: 'var(--surface-2)',
};

const titleStyle: CSSProperties = {
  fontWeight: 600,
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
  fontSize: 10.5,
  color: 'var(--ink-3)',
};

const bodyStyle: CSSProperties = {
  padding: '12px 14px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const labelStyle: CSSProperties = {
  fontSize: 10.5,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--ink-3)',
  fontWeight: 600,
};

const segmentsStyle: CSSProperties = {
  display: 'flex',
  gap: 4,
  padding: 3,
  background: 'var(--surface-2)',
  borderRadius: 8,
  border: '1px solid var(--hair)',
};

function segBtnStyle(active: boolean): CSSProperties {
  return {
    flex: 1,
    padding: '6px 8px',
    border: 0,
    background: active ? 'var(--surface)' : 'transparent',
    borderRadius: 5,
    fontSize: 11.5,
    color: active ? 'var(--ink)' : 'var(--ink-2)',
    cursor: 'pointer',
    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
    fontWeight: active ? 600 : 500,
  };
}

const swatchesStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(6, 1fr)',
  gap: 6,
};

function swatchStyle(color: string, active: boolean): CSSProperties {
  return {
    aspectRatio: '1 / 1',
    borderRadius: '50%',
    border: '2px solid ' + (active ? 'var(--ink)' : 'transparent'),
    cursor: 'pointer',
    background: color,
    boxShadow: active ? '0 0 0 2px var(--surface) inset' : 'none',
  };
}

const hideToggleStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--hair)',
  background: 'var(--surface-2)',
  color: 'var(--ink-2)',
  fontSize: 12,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  cursor: 'pointer',
};

const pillStyle: CSSProperties = {
  position: 'fixed',
  right: 20,
  bottom: 20,
  zIndex: 50,
  padding: '8px 12px',
  borderRadius: 999,
  background: 'var(--surface)',
  border: '1px solid var(--hair)',
  color: 'var(--ink-2)',
  fontSize: 11.5,
  cursor: 'pointer',
  boxShadow: '0 6px 20px rgba(0,0,0,0.08)',
  fontWeight: 500,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

export function TweaksPanel() {
  const { settings, tweaksOpen, setTweaksOpen, setTheme, setAccent, setDensity, toggleSidebar } =
    useUIStore();
  const isMobile = useIsMobile();

  const mobilePillStyle: CSSProperties = {
    ...pillStyle,
    right: 'calc(16px + env(safe-area-inset-right))',
    bottom: 'calc(16px + env(safe-area-inset-bottom))',
  };

  const mobilePanelStyle: CSSProperties = {
    ...panelStyle,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    borderRadius: '14px 14px 0 0',
    maxHeight: '80dvh',
    overflowY: 'auto',
    paddingBottom: 'env(safe-area-inset-bottom)',
  };

  if (!tweaksOpen) {
    return (
      <button
        style={isMobile ? mobilePillStyle : pillStyle}
        onClick={() => setTweaksOpen(true)}
        type="button"
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--berry)',
            display: 'inline-block',
          }}
        />
        Tweaks
      </button>
    );
  }

  return (
    <div style={isMobile ? mobilePanelStyle : panelStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>Tweaks</span>
        <button
          onClick={() => setTweaksOpen(false)}
          style={{
            background: 'transparent',
            border: 0,
            color: 'var(--ink-3)',
            cursor: 'pointer',
          }}
          type="button"
          title="Close"
        >
          <IconX size={13} />
        </button>
      </div>
      <div style={bodyStyle}>
        <div style={rowStyle}>
          <span style={labelStyle}>Theme</span>
          <div style={segmentsStyle}>
            {(['dark', 'light'] as Theme[]).map((t) => (
              <button
                key={t}
                style={segBtnStyle(settings.theme === t)}
                onClick={() => setTheme(t)}
                type="button"
              >
                {t === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>Accent</span>
          <div style={swatchesStyle}>
            {ACCENTS.map((a) => (
              <div
                key={a.id}
                style={swatchStyle(a.hex, settings.accent === a.id)}
                title={a.name}
                onClick={() => setAccent(a.id as AccentId)}
              />
            ))}
          </div>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>Density</span>
          <div style={segmentsStyle}>
            {(['dense', 'balanced', 'comfy'] as Density[]).map((d) => (
              <button
                key={d}
                style={segBtnStyle(settings.density === d)}
                onClick={() => setDensity(d)}
                type="button"
              >
                {d[0].toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div style={rowStyle}>
          <button style={hideToggleStyle} onClick={toggleSidebar} type="button">
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <IconSidebar size={14} />
              Sidebar
            </span>
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
              {settings.sidebarHidden ? 'Hidden' : 'Visible'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
