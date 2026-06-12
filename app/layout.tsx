import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
});

export const metadata: Metadata = {
  title: 'Allocations QA Dashboard',
  description: 'Playwright test results for allocations.com',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
