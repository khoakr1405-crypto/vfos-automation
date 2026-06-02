import { ACCENT_TEXT, type AccentKey } from '@/lib/nav';

type StatCardProps = {
  label: string;
  value: string;
  delta?: string;
  trend?: 'up' | 'down' | 'flat';
  accent?: AccentKey;
};

const TREND_COLOR: Record<'up' | 'down' | 'flat', string> = {
  up: 'text-accent-green',
  down: 'text-accent-rose',
  flat: 'text-neutral-400',
};
const TREND_SIGN: Record<'up' | 'down' | 'flat', string> = { up: '▲', down: '▼', flat: '■' };

export function StatCard({ label, value, delta, trend = 'flat', accent = 'blue' }: StatCardProps) {
  return (
    <div className="rounded-xl border border-hairline bg-raised/50 px-4 py-3.5">
      <p className="text-xs text-neutral-400">{label}</p>
      <p className={`mt-1.5 text-xl font-semibold tracking-tight ${ACCENT_TEXT[accent]}`}>
        {value}
      </p>
      {delta && (
        <p className={`mt-1 text-[11px] font-medium ${TREND_COLOR[trend]}`}>
          {TREND_SIGN[trend]} {delta}
        </p>
      )}
    </div>
  );
}
