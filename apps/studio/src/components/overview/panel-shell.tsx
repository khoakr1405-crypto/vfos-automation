import type { ReactNode } from 'react';

/**
 * PanelShell — recipe "áo" dùng chung cho mọi panel màn Tổng quan (redesign
 * concept 07/2026, Operator đã duyệt gu trên áo mẫu "Công việc ưu tiên").
 *
 * Đóng gói: nền gradient deep-navy, viền + glow theo accent, thanh accent + tiêu
 * đề uppercase tracking-wider, slot phải (badge/link). Component con chỉ truyền
 * children (body) — KHÔNG lặp lại chrome ở từng chỗ.
 */

export type PanelAccent = 'blue' | 'amber' | 'violet' | 'green' | 'cyan' | 'rose' | 'neutral';

const SHELL: Record<
  PanelAccent,
  { border: string; glow: string; bar: string; title: string; blur: string }
> = {
  blue: {
    border: 'border-accent-blue/15',
    glow: 'shadow-[0_0_50px_-18px_rgba(59,130,246,0.35),0_1px_0_0_rgba(148,183,255,0.06)_inset]',
    bar: 'bg-accent-blue shadow-[0_0_8px_rgba(59,130,246,0.8)]',
    title: 'text-blue-400',
    blur: 'bg-accent-blue/10',
  },
  amber: {
    border: 'border-accent-amber/15',
    glow: 'shadow-[0_0_50px_-18px_rgba(245,158,11,0.25),0_1px_0_0_rgba(255,214,148,0.05)_inset]',
    bar: 'bg-accent-amber shadow-[0_0_8px_rgba(245,158,11,0.8)]',
    title: 'text-amber-400',
    blur: 'bg-accent-amber/[0.07]',
  },
  violet: {
    border: 'border-accent-violet/15',
    glow: 'shadow-[0_0_50px_-18px_rgba(139,92,246,0.3),0_1px_0_0_rgba(196,167,255,0.05)_inset]',
    bar: 'bg-accent-violet shadow-[0_0_8px_rgba(139,92,246,0.8)]',
    title: 'text-violet-400',
    blur: 'bg-accent-violet/[0.08]',
  },
  green: {
    border: 'border-accent-green/15',
    glow: 'shadow-[0_0_50px_-18px_rgba(34,197,94,0.28),0_1px_0_0_rgba(148,255,183,0.05)_inset]',
    bar: 'bg-accent-green shadow-[0_0_8px_rgba(34,197,94,0.8)]',
    title: 'text-green-400',
    blur: 'bg-accent-green/[0.07]',
  },
  cyan: {
    border: 'border-accent-cyan/15',
    glow: 'shadow-[0_0_50px_-18px_rgba(34,211,238,0.28),0_1px_0_0_rgba(148,240,255,0.05)_inset]',
    bar: 'bg-accent-cyan shadow-[0_0_8px_rgba(34,211,238,0.8)]',
    title: 'text-cyan-400',
    blur: 'bg-accent-cyan/[0.07]',
  },
  rose: {
    border: 'border-accent-rose/15',
    glow: 'shadow-[0_0_50px_-18px_rgba(244,63,94,0.28),0_1px_0_0_rgba(255,148,183,0.05)_inset]',
    bar: 'bg-accent-rose shadow-[0_0_8px_rgba(244,63,94,0.8)]',
    title: 'text-rose-400',
    blur: 'bg-accent-rose/[0.08]',
  },
  neutral: {
    border: 'border-hairline',
    glow: 'shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]',
    bar: 'bg-neutral-500',
    title: 'text-neutral-300',
    blur: 'bg-transparent',
  },
};

export function PanelShell({
  accent = 'blue',
  title,
  subtitle,
  right,
  children,
  bodyClass = 'relative px-5 py-4',
}: {
  accent?: PanelAccent;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  bodyClass?: string;
}) {
  const s = SHELL[accent];
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-b from-card via-panel to-panel ${s.border} ${s.glow}`}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-24 right-0 h-48 w-96 rounded-full ${s.blur} blur-3xl`}
      />
      <div className="relative flex items-center justify-between gap-3 border-b border-hairline/70 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className={`h-3.5 w-1 shrink-0 rounded-full ${s.bar}`} />
          <div>
            <h2 className={`text-xs font-semibold uppercase tracking-wider ${s.title}`}>{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
          </div>
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      <div className={bodyClass}>{children}</div>
    </div>
  );
}

/** Badge pill glass cho slot phải của PanelShell (vd "Cần xử lý: 26 job"). */
export function PanelBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs text-neutral-400 backdrop-blur-sm tabular-nums">
      {children}
    </span>
  );
}
