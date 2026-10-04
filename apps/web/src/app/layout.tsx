import type { Metadata } from 'next';
import '../styles/theme.css';
import '../styles/game.css';

export const metadata: Metadata = {
  title: 'git money',
  icons: { icon: [{ url: '/favicon.png', type: 'image/png', sizes: '32x32' }] },
  description: 'Two coders. One vault. Only one gets away.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* theme.css's own font @import lands after Tailwind's rules and is ignored by browsers. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
