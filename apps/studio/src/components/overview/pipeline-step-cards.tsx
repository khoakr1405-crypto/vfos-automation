import type { PanelAccent } from '@/components/overview/panel-shell';

/**
 * PipelineStepCards — dải thẻ nằm ngang theo BƯỚC pipeline (redesign concept
 * 07/2026, khối "Trạng thái lane"). Thay chip state máy: mỗi thẻ = 1 bước
 * Operator hiểu được (Sản phẩm → … → Đã đăng), count THẬT gom từ state job.
 *
 * PURE render — caller tự gom count từ data thật của lane mình; component không
 * fetch, không bịa số. Bước count=0 vẫn hiện (mờ đi) để thấy trọn pipeline.
 */

export interface PipelineStep {
  no: number;
  label: string;
  accent: PanelAccent;
  count: number;
  /** Dòng phụ mô tả count (vd "chờ duyệt", "sẵn sàng"). */
  sub: string;
}

const STEP_TONE: Record<
  PanelAccent,
  { tile: string; label: string; border: string; num: string }
> = {
  blue: {
    tile: 'border-accent-blue/40 bg-accent-blue/20 text-accent-blue shadow-[0_0_18px_-4px_rgba(59,130,246,0.6)]',
    label: 'text-blue-400',
    border: 'hover:border-accent-blue/30',
    num: 'text-accent-blue',
  },
  cyan: {
    tile: 'border-accent-cyan/40 bg-accent-cyan/20 text-accent-cyan shadow-[0_0_18px_-4px_rgba(34,211,238,0.6)]',
    label: 'text-cyan-400',
    border: 'hover:border-accent-cyan/30',
    num: 'text-accent-cyan',
  },
  violet: {
    tile: 'border-accent-violet/40 bg-accent-violet/20 text-accent-violet shadow-[0_0_18px_-4px_rgba(139,92,246,0.6)]',
    label: 'text-violet-400',
    border: 'hover:border-accent-violet/30',
    num: 'text-accent-violet',
  },
  amber: {
    tile: 'border-accent-amber/40 bg-accent-amber/20 text-accent-amber shadow-[0_0_18px_-4px_rgba(245,158,11,0.6)]',
    label: 'text-amber-400',
    border: 'hover:border-accent-amber/30',
    num: 'text-accent-amber',
  },
  green: {
    tile: 'border-accent-green/40 bg-accent-green/20 text-accent-green shadow-[0_0_18px_-4px_rgba(34,197,94,0.6)]',
    label: 'text-green-400',
    border: 'hover:border-accent-green/30',
    num: 'text-accent-green',
  },
  rose: {
    tile: 'border-accent-rose/40 bg-accent-rose/20 text-accent-rose shadow-[0_0_18px_-4px_rgba(244,63,94,0.6)]',
    label: 'text-rose-400',
    border: 'hover:border-accent-rose/30',
    num: 'text-accent-rose',
  },
  neutral: {
    tile: 'border-hairline bg-raised/40 text-neutral-500',
    label: 'text-neutral-400',
    border: 'hover:border-hairline',
    num: 'text-neutral-300',
  },
};

export function PipelineStepCards({ steps }: { steps: PipelineStep[] }) {
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
      {steps.map((s) => {
        const t = STEP_TONE[s.accent];
        const active = s.count > 0;
        return (
          <div
            key={s.no}
            className={`rounded-xl border bg-panel/70 px-3 py-3 text-center transition-colors duration-300 ease-in-out ${
              active ? `border-hairline/80 ${t.border}` : 'border-hairline/40'
            }`}
          >
            <span
              className={`mx-auto flex h-10 w-10 items-center justify-center rounded-xl border font-mono text-sm font-bold ${
                active ? t.tile : STEP_TONE.neutral.tile
              }`}
            >
              {s.no}
            </span>
            <p
              className={`mt-2 truncate text-[11px] font-semibold ${active ? t.label : 'text-neutral-500'}`}
              title={s.label}
            >
              {s.label}
            </p>
            <p className="mt-1 text-[10px] text-neutral-500">
              <span
                className={`font-mono text-sm font-bold tabular-nums ${active ? t.num : 'text-neutral-600'}`}
              >
                {s.count}
              </span>{' '}
              {s.sub}
            </p>
          </div>
        );
      })}
    </div>
  );
}
