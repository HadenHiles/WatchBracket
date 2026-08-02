import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Watch Bracket', description: 'Turn choosing what to watch into a game.', manifest: '/manifest.webmanifest', applicationName: 'Watch Bracket' };
export const viewport: Viewport = { themeColor: '#090912', width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }

