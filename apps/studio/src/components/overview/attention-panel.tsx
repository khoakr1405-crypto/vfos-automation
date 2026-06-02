import { ATTENTION_ITEMS, type AttentionLevel } from '@/lib/mock-data';
import Link from 'next/link';
import { Card, CardBody, CardHeader } from '../card';
import { UtilIcon } from '../icons';

const LEVEL_META: Record<
  AttentionLevel,
  { label: string; dot: string; text: string; border: string }
> = {
  high: {
    label: 'Cao',
    dot: 'bg-accent-rose',
    text: 'text-accent-rose',
    border: 'border-l-accent-rose',
  },
  medium: {
    label: 'Vừa',
    dot: 'bg-accent-amber',
    text: 'text-accent-amber',
    border: 'border-l-accent-amber',
  },
  low: {
    label: 'Thấp',
    dot: 'bg-accent-blue',
    text: 'text-accent-blue',
    border: 'border-l-accent-blue',
  },
};

/** C. Danh sách việc cần chú ý — alert + module + hành động + link. */
export function AttentionPanel() {
  const highCount = ATTENTION_ITEMS.filter((i) => i.level === 'high').length;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title="Việc cần chú ý"
        subtitle={`${ATTENTION_ITEMS.length} việc · ${highCount} mức cao`}
        accentClass="text-accent-amber"
        right={
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-accent-rose/15 px-2 text-[11px] font-bold text-accent-rose">
            {highCount}
          </span>
        }
      />
      <CardBody className="flex-1 space-y-2">
        {ATTENTION_ITEMS.map((item) => {
          const meta = LEVEL_META[item.level];
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`group block rounded-lg border border-hairline border-l-2 bg-raised/40 px-3 py-2.5 transition hover:bg-raised ${meta.border}`}
            >
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
                <p className="flex-1 text-xs font-medium text-neutral-100">{item.title}</p>
                <span className={`text-[10px] font-semibold uppercase ${meta.text}`}>
                  {meta.label}
                </span>
              </div>
              <p className="mt-1 pl-3.5 text-[11px] leading-snug text-neutral-500">{item.detail}</p>
              <div className="mt-1.5 flex items-center justify-between pl-3.5">
                <span className="text-[10px] text-neutral-600">{item.module}</span>
                <span className="flex items-center gap-1 text-[10px] font-medium text-neutral-300 group-hover:text-white">
                  {item.action} <UtilIcon name="chevron" width={11} height={11} />
                </span>
              </div>
            </Link>
          );
        })}
      </CardBody>
    </Card>
  );
}
