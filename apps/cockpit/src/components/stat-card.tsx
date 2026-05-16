import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: 'default' | 'emerald' | 'amber' | 'rose' | 'sky';
}

const ACCENT_BORDER: Record<NonNullable<StatCardProps['accent']>, string> = {
  default: 'border-neutral-800',
  emerald: 'border-emerald-700/60',
  amber: 'border-amber-700/60',
  rose: 'border-rose-700/60',
  sky: 'border-sky-700/60',
};

export function StatCard({ label, value, hint, accent = 'default' }: StatCardProps) {
  return (
    <div className={`rounded-lg border ${ACCENT_BORDER[accent]} bg-neutral-900/40 p-4`}>
      <div className="text-xs font-medium uppercase tracking-wider text-neutral-400">{label}</div>
      <div className="mt-2 font-mono text-2xl font-semibold text-neutral-100">{value}</div>
      {hint && <div className="mt-1 text-xs text-neutral-500">{hint}</div>}
    </div>
  );
}
