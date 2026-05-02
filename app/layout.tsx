import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const bricolage = Bricolage_Grotesque({
  variable: '--font-bricolage',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: false,
});

const jetbrains = JetBrains_Mono({
  variable: '--font-jetbrains',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: 'Strawberry Notes',
  description: 'A simple, self-hostable notes app. Open source and delicious.',
  applicationName: 'Strawberry Notes',
  appleWebApp: {
    capable: true,
    title: 'Strawberry Notes',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/icons/favicon.svg',
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  // Match the user's OS-level light/dark preference on the iOS / Android
  // address bar and PWA splash. Both colours are the `--bg` token from
  // app/globals.css for the matching scheme.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf5f1' },
    { media: '(prefers-color-scheme: dark)', color: '#15100f' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Inline theme-init script: applies stored theme + accent before paint to avoid FOUC.
const themeInit = `
(function () {
  try {
    var s = JSON.parse(localStorage.getItem('sn-settings') || '{}');
    var theme = s.theme || 'dark';
    var accent = s.accent || 'strawberry';
    var accents = {
      strawberry: { hex: '#e33d4e', ink: '#b02537', soft: '#fde0e3', softDark: '#3a1a20' },
      leaf:       { hex: '#5fae6a', ink: '#3f8a4c', soft: '#e1f0e3', softDark: '#1f3324' },
      jam:        { hex: '#a8324a', ink: '#7a1f33', soft: '#f6dde2', softDark: '#2f1219' },
      cherry:     { hex: '#c62828', ink: '#8f1a1a', soft: '#fadada', softDark: '#34100f' },
      mint:       { hex: '#3faa89', ink: '#277a61', soft: '#d6ede5', softDark: '#112a23' },
      ink:        { hex: '#3b5bdb', ink: '#1e3a9e', soft: '#e7ecff', softDark: '#1e2440' }
    };
    var a = accents[accent] || accents.strawberry;
    var r = document.documentElement;
    r.setAttribute('data-theme', theme);
    r.style.setProperty('--berry', a.hex);
    r.style.setProperty('--berry-ink', a.ink);
    r.style.setProperty('--berry-soft', theme === 'dark' ? a.softDark : a.soft);
    var sw = typeof s.sidebarWidth === 'number' && s.sidebarWidth > 0 ? s.sidebarWidth : 232;
    var lw = typeof s.noteListWidth === 'number' && s.noteListWidth > 0 ? s.noteListWidth : 300;
    r.style.setProperty('--sn-sidebar-width', sw + 'px');
    r.style.setProperty('--sn-list-width', lw + 'px');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${inter.variable} ${bricolage.variable} ${jetbrains.variable}`}
    >
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInit}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
