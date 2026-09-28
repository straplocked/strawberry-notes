import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Strawberry Notes',
    short_name: 'Strawberry',
    description: 'Simple, self-hostable notes with an Apple-Notes feel.',
    start_url: '/notes',
    display: 'standalone',
    background_color: '#15100f',
    theme_color: '#15100f',
    icons: [
      { src: '/icons/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Dedicated maskable renders (logo inside the 80% safe zone on an
      // opaque background) — see scripts/generate-pwa-icons.mjs. Reusing
      // the "any" icons here made Android's mask crop the logo.
      { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    categories: ['productivity', 'utilities'],
  };
}
