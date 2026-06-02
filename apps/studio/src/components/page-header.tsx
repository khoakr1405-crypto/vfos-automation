import { ACCENT_BG_SOFT, type AccentKey, type IconKey } from '@/lib/nav';
import type { ReactNode } from 'react';
import { Icon } from './icons';

type PageHeaderProps = {
  no: number;
  icon: IconKey;
  accent: AccentKey;
  title: string;
  description: string;
  actions?: ReactNode;
};

/** Consistent header for every module page (number + icon + title + actions). */
export function PageHeader({ no, icon, accent, title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3.5">
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${ACCENT_BG_SOFT[accent]}`}
        >
          <Icon name={icon} width={22} height={22} />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-neutral-500">MODULE {no}</span>
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-neutral-50">{title}</h1>
          <p className="text-xs text-neutral-500">{description}</p>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
