'use client';

import { ACCENT_TEXT, NAV_GROUPS } from '@/lib/nav';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './icons';

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-hairline bg-panel/70 lg:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent-blue to-accent-violet text-sm font-black text-white">
          V
        </span>
        <div className="leading-tight">
          <p className="text-sm font-bold tracking-wide text-neutral-50">VFOS</p>
          <p className="text-[10px] text-neutral-500">Trung tâm điều phối</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition ${
                        active
                          ? 'bg-raised text-neutral-50'
                          : 'text-neutral-400 hover:bg-raised/50 hover:text-neutral-200'
                      }`}
                    >
                      <span
                        className={
                          active
                            ? ACCENT_TEXT[item.accent]
                            : 'text-neutral-500 group-hover:text-neutral-300'
                        }
                      >
                        <Icon name={item.icon} />
                      </span>
                      <span className="flex-1">{item.label}</span>
                      <span className="text-[10px] font-mono text-neutral-600">{item.no}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-hairline px-5 py-3 text-[10px] text-neutral-600">
        VFOS Studio · v0.1 · UI shell
      </div>
    </aside>
  );
}
