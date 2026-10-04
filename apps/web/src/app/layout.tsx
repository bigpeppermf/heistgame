import type { Metadata } from 'next';
import '../styles/theme.css';
import '../styles/game.css';

export const metadata: Metadata = {
  title: 'git money',
  icons: { icon: [{ url: '/favicon.png', type: 'image/png', sizes: '32x32' }] },
  description: 'A two-player coding game.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Gruppo&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
