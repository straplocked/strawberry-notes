/*
 * Icon set ported 1:1 from the Strawberry Notes design bundle (sn-icons.jsx).
 * All icons: 24x24 viewBox, stroke-only, currentColor, sized via `size` prop.
 */
import type { CSSProperties, SVGProps } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
}

function common(p: IconProps) {
  const { size = 16, strokeWidth = 1.8, ...rest } = p;
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...rest,
  };
}

export const IconAll = (p: IconProps) => (
  <svg {...common(p)}>
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="17" x2="14" y2="17" />
  </svg>
);

export const IconPin = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="M12 17v5" />
    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
  </svg>
);

export const IconPinFill = (p: IconProps) => {
  const { size = 16, style, ...rest } = p;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      style={style}
      {...rest}
    >
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
      <rect x="11.25" y="17" width="1.5" height="5" rx="0.5" />
    </svg>
  );
};

export const IconFolder = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
  </svg>
);

export const IconTrash = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
  </svg>
);

export const IconTag = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9z" />
    <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const IconSearch = (p: IconProps) => (
  <svg {...common(p)}>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-4.3-4.3" />
  </svg>
);

export const IconPlus = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconEdit = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="M15 4 20 9l-11 11H4v-5L15 4z" />
  </svg>
);

export const IconBold = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="M6 4h6a4 4 0 0 1 0 8H6zm0 8h7a4 4 0 0 1 0 8H6z" />
  </svg>
);

export const IconItalic = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="M19 4h-9M14 20H5M15 4l-6 16" />
  </svg>
);

export const IconUnderline = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="M6 4v9a6 6 0 0 0 12 0V4M5 21h14" />
  </svg>
);

export const IconStrike = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="M4 12h16M8 7a4 4 0 0 1 4-3c3 0 4 2 4 3M8 17a4 4 0 0 0 4 3c3 0 4-2 4-3" />
  </svg>
);

export const IconH1 = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="M5 5v14M13 5v14M5 12h8M17 10l3-2v11" />
  </svg>
);

export const IconH2 = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="M4 5v14M11 5v14M4 12h7M16 9a2.5 2.5 0 1 1 4.5 1.5L16 19h5" />
  </svg>
);

export const IconCheck = (p: IconProps) => (
  <svg {...common(p)}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="m8 12 3 3 5-6" />
  </svg>
);

export const IconList = (p: IconProps) => (
  <svg {...common(p)}>
    <circle cx="5" cy="7" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="5" cy="17" r="1.2" fill="currentColor" stroke="none" />
    <path d="M10 7h11M10 12h11M10 17h11" />
  </svg>
);

export const IconQuote = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="M7 6c-2 1-3 3-3 6v4h5v-5H6c0-2 1-4 3-4zm10 0c-2 1-3 3-3 6v4h5v-5h-3c0-2 1-4 3-4z" />
  </svg>
);

export const IconImage = (p: IconProps) => (
  <svg {...common(p)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="8.5" cy="10" r="1.5" />
    <path d="m21 17-5-5-9 9" />
  </svg>
);

export const IconAttach = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="m21 11-8 8a5.5 5.5 0 0 1-8-8l9-9a3.8 3.8 0 0 1 5.5 5.5L10 17a2 2 0 0 1-3-3l8-8" />
  </svg>
);

export const IconDivider = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="M3 12h4M10 12h4M17 12h4" />
  </svg>
);

export const IconUndo = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />
  </svg>
);

export const IconRedo = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />
  </svg>
);

export const IconShare = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
);

export const IconMore = (p: IconProps) => (
  <svg {...common(p)}>
    <circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const IconSidebar = (p: IconProps) => (
  <svg {...common(p)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line x1="10" y1="4" x2="10" y2="20" />
  </svg>
);

export const IconSun = (p: IconProps) => (
  <svg {...common(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const IconMoon = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z" />
  </svg>
);

export const IconX = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconCalendar = (p: IconProps) => (
  <svg {...common(p)}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="8" y1="3" x2="8" y2="7" />
    <line x1="16" y1="3" x2="16" y2="7" />
  </svg>
);

export const IconChevDown = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const IconChevRight = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const IconLogout = (p: IconProps) => (
  <svg {...common(p)}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
);

export const IconCog = (p: IconProps) => (
  <svg {...common(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

// Brand mark — a strawberry with two green leaves. Filled, not stroke-based.
export const IconBerry = (p: IconProps) => {
  const { size = 20, style } = p;
  const berryColor = p.color ?? '#e33d4e';
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={style}>
      <path
        d="M24 44
           C 12 44, 6 32, 7 24
           C 8 18, 13 14, 18 13
           C 20.5 12.5, 22 13, 24 13
           C 26 13, 27.5 12.5, 30 13
           C 35 14, 40 18, 41 24
           C 42 32, 36 44, 24 44 Z"
        fill={berryColor}
      />
      <path
        d="M17 20 C 14 25, 14 32, 18 38"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      {/* Seeds */}
      {[
        [17, 22],
        [24, 21],
        [31, 22],
        [14, 28],
        [21, 28],
        [28, 28],
        [35, 28],
        [17, 34],
        [24, 34],
        [31, 34],
      ].map(([cx, cy], i) => (
        <ellipse
          key={i}
          cx={cx}
          cy={cy}
          rx="1.1"
          ry="1.5"
          fill="#ffd166"
          transform={`rotate(${(cx + cy) % 30 - 15} ${cx} ${cy})`}
        />
      ))}
      {/* Leaves */}
      <path
        d="M24 13
           C 20 8, 14 7, 11 10
           C 14 10, 18 12, 20 14
           Z"
        fill="#5fae6a"
      />
      <path
        d="M24 13
           C 28 8, 34 7, 37 10
           C 34 10, 30 12, 28 14
           Z"
        fill="#5fae6a"
      />
      <path d="M24 13 L 24 9" stroke="#3f8a4c" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
};
