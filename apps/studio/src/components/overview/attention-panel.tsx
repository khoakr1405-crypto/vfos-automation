import { ATTENTION_ITEMS, type AttentionLevel } from '@/lib/mock-data';
import Link from 'next/link';
import { Card, CardBody, CardHeader } from '../card';
import { UtilIcon } from '../icons';

const LEVEL_META: Record<
  AttentionLevel,
  { label: string; text: string; bg: string; border: string; iconColor: string }
> = {
  high: {
    label: 'Khẩn cấp',
    text: 'text-accent-rose',
    bg: 'bg-accent-rose/10',
    border: 'border-accent-rose/20 hover:border-accent-rose/40',
    iconColor: 'text-accent-rose',
  },
  medium: {
    label: 'Cảnh báo',
    text: 'text-accent-amber',
    bg: 'bg-accent-amber/10',
    border: 'border-accent-amber/20 hover:border-accent-amber/40',
    iconColor: 'text-accent-amber',
  },
  low: {
    label: 'Chú ý',
    text: 'text-accent-blue',
    bg: 'bg-accent-blue/10',
    border: 'border-accent-blue/20 hover:border-accent-blue/40',
    iconColor: 'text-accent-blue',
  },
};

/** C. Danh sách việc cần chú ý — alert + module + hành động + link. */
export function AttentionPanel() {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title="Cảnh báo cần chú ý"
        subtitle={`${ATTENTION_ITEMS.length} cảnh báo vận hành`}
        accentClass="text-accent-amber"
        right={
          <Link href="/qa" className="text-[11px] text-neutral-500 hover:text-neutral-300">
            Xem chi tiết
          </Link>
        }
      />
      <CardBody className="flex-1 space-y-2">
        {ATTENTION_ITEMS.slice(0, 4).map((item) => {
          const meta = LEVEL_META[item.level];
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`group block rounded-lg border bg-panel/50 px-3.5 py-3 transition ${meta.border}`}
            >
              <div className="flex items-start gap-3">
                {/* Warning Icon Container */}
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${meta.bg} ${meta.iconColor}`}
                >
                  <UtilIcon name="bell" width={14} height={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-neutral-100 truncate">{item.title}</p>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.text}`}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-neutral-500">{item.detail}</p>
                  <div className="mt-2.5 flex items-center justify-between text-[10px]">
                    <span className="text-neutral-600 font-mono">{item.module}</span>
                    <span className="flex items-center gap-1 font-medium text-neutral-400 group-hover:text-neutral-200 transition-colors">
                      {item.action} <UtilIcon name="chevron" width={10} height={10} />
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </CardBody>
    </Card>
  );
}
