import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Nav } from '@/components/nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'VFOS Cockpit',
  description: 'ViralForge OS — admin console',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <Nav />
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
