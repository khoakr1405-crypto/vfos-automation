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

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="space-y-1">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-neutral-500/80">
              {group.title}
            </p>
            <ul className="space-y-0.5 border-l border-hairline/30 ml-3.5 pl-2">
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs transition ${
                        active
                          ? 'bg-raised text-neutral-50 font-medium'
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

      <div className="border-t border-hairline px-5 py-3.5 text-[10px] text-neutral-600 font-medium">
        VFOS Studio · v1.0 · Operator Control
      </div>
    </aside>
  );
}
