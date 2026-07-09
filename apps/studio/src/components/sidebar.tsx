'use client';

import { ACCENT_TEXT, NAV_GROUPS } from '@/lib/nav';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Icon } from './icons';

/**
 * Determine whether a nav item is "active" given the current pathname + search
 * params. Lane items use `/create?lane=X` — we match both the pathname AND the
 * query parameter. Non-lane items just compare pathname.
 */
function isActive(itemHref: string, pathname: string, searchParams: URLSearchParams): boolean {
  const [itemPath, itemQuery] = itemHref.split('?');
  // If the nav item has a query string (lane items), match pathname + query.
  if (itemQuery) {
    if (pathname !== itemPath) return false;
    const params = new URLSearchParams(itemQuery);
    for (const [key, value] of params.entries()) {
      if (searchParams.get(key) !== value) return false;
    }
    return true;
  }
  // Plain pathname match (exact).
  return pathname === itemPath;
}

// Triết lý VFOS (redesign concept 07/2026) — nhãn thương hiệu tĩnh, không data.
const PHILOSOPHY = [
  'Approve nhanh — publish chuẩn',
  'Bảo vệ kênh — Bảo vệ doanh thu',
  'Data minh bạch — Ra quyết định tốt hơn',
];

function SidebarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-hairline bg-panel/70 lg:flex">
      {/* Branding block (redesign concept) — logo gradient + tên + badge + tagline. */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent-blue to-accent-violet text-base font-black text-white shadow-[0_0_18px_-4px_rgba(139,92,246,0.7)]">
            V
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-wide text-neutral-50">VFOS Studio</p>
            <span className="mt-0.5 inline-block rounded-full border border-accent-violet/30 bg-accent-violet/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-violet-300">
              Redesign Concept
            </span>
          </div>
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-neutral-500">
          Hệ điều hành vận hành cho Operator
          <br />
          <span className="text-neutral-600">Content + Affiliate + Review</span>
        </p>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto border-t border-hairline/60 px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="space-y-1">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-neutral-500/80">
              {group.title}
            </p>

            <ul className="ml-3.5 space-y-0.5 border-l border-hairline/30 pl-2">
              {group.items.map((item) => {
                const active = isActive(item.href, pathname, searchParams);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs transition-all duration-300 ease-in-out ${
                        active
                          ? 'bg-raised font-medium text-neutral-50 shadow-[inset_2px_0_0_0_rgba(139,92,246,0.7)]'
                          : 'text-neutral-400 hover:bg-raised/40 hover:text-neutral-200'
                      }`}
                    >
                      <span
                        className={
                          active
                            ? ACCENT_TEXT[item.accent]
                            : 'text-neutral-500 group-hover:text-neutral-300'
                        }
                      >
                        <Icon name={item.icon} width={14} height={14} />
                      </span>
                      <span className="flex-1 truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Triết lý VFOS — box thương hiệu tĩnh (redesign concept). */}
      <div className="mx-3 mb-3 rounded-xl border border-hairline/70 bg-gradient-to-b from-raised/30 to-transparent px-3.5 py-3">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-violet-300">
          <span className="h-1 w-1 rounded-full bg-accent-violet shadow-[0_0_6px_rgba(139,92,246,0.9)]" />
          Triết lý VFOS
        </p>
        <p className="mt-1.5 text-[10px] leading-relaxed text-neutral-500">
          Đúng quy trình — Đúng thời điểm — Đúng chuẩn, mọi hành động đều được đo lường và tối ưu.
        </p>
        <ul className="mt-2 space-y-1">
          {PHILOSOPHY.map((line) => (
            <li key={line} className="flex items-start gap-1.5 text-[10px] text-neutral-400">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-neutral-600" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-hairline px-5 py-3 text-[10px] font-medium text-neutral-600">
        VFOS Studio · v2.0 · Operator Control
      </div>
    </aside>
  );
}

export function Sidebar() {
  return (
    <Suspense>
      <SidebarInner />
    </Suspense>
  );
}
