import { type AttentionLevel, PUBLISH_WARNINGS } from '@/lib/mock-data';
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

/** G. Warning / Blocked Panel — vấn đề chặn publish + link sang module xử lý. */
export function PublishWarningsPanel() {
  const high = PUBLISH_WARNINGS.filter((w) => w.level === 'high').length;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title="Cảnh báo & khóa publish"
        subtitle={`${PUBLISH_WARNINGS.length} vấn đề · ${high} mức cao`}
        accentClass="text-accent-rose"
        right={
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-accent-rose/15 px-2 text-[11px] font-bold text-accent-rose">
            {high}
          </span>
        }
      />
      <CardBody className="flex-1 space-y-2">
        {PUBLISH_WARNINGS.map((w) => {
          const meta = LEVEL_META[w.level];
          return (
            <Link
              key={w.id}
              href={w.href}
              className={`group block rounded-lg border border-hairline border-l-2 bg-raised/40 px-3 py-2.5 transition hover:bg-raised ${meta.border}`}
            >
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
                <p className="flex-1 text-xs font-medium text-neutral-100">{w.title}</p>
                <span className={`text-[10px] font-semibold uppercase ${meta.text}`}>
                  {meta.label}
                </span>
              </div>
              <p className="mt-1 pl-3.5 text-[11px] leading-snug text-neutral-500">{w.detail}</p>
              <span className="mt-1.5 flex items-center justify-end gap-1 text-[10px] font-medium text-neutral-300 group-hover:text-white">
                {w.action} <UtilIcon name="chevron" width={11} height={11} />
              </span>
            </Link>
          );
        })}
      </CardBody>
    </Card>
  );
}
