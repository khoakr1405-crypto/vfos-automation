import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'VFOS Studio — Trung tâm điều phối nội dung đa kênh',
  description:
    'Sản xuất, quản lý và xuất bản nội dung video affiliate đa kênh (Facebook / TikTok / YouTube). UI shell — Round UI-01.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body className="h-screen font-sans antialiased overflow-hidden">
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex h-screen min-w-0 flex-1 flex-col overflow-y-auto">
            <Topbar />
            <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
