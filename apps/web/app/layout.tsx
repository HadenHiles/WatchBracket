import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://bracket.famflix.live'),
  title: 'Watch Bracket',
  description: 'Turn choosing what to watch into a game.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Watch Bracket',
  icons: {
    icon: [{ url: '/brand/watch-bracket-app-icon.png', type: 'image/png', sizes: '512x512' }],
    apple: [{ url: '/brand/watch-bracket-app-icon.png', type: 'image/png', sizes: '512x512' }]
  },
  openGraph: {
    title: 'Watch Bracket',
    description: 'Turn choosing what to watch into a game.',
    images: [{ url: '/brand/video-store-hero-banner.png', width: 1672, height: 941, alt: 'Watch Bracket video-store movie night' }]
  }
};
export const viewport: Viewport = { themeColor: '#090912', width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
