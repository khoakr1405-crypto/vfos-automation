import type { QaFinding, RiskLevel } from '@/lib/mock-data';
import Link from 'next/link';
import { Card, CardBody, CardHeader } from '../card';
import { UtilIcon } from '../icons';

const SEVERITY_META: Record<
  RiskLevel,
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

/** I. QA Findings / Issue Panel — lỗi & cảnh báo + link sang module xử lý. */
export function QaFindingsPanel({ findings }: { findings: QaFinding[] }) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title="Lỗi & cảnh báo QA"
        subtitle={findings.length === 0 ? 'Không có lỗi' : `${findings.length} mục cần xem`}
        accentClass="text-accent-rose"
      />
      <CardBody className="flex-1 space-y-2">
        {findings.length === 0 && (
          <p className="rounded-lg border border-dashed border-hairline px-3 py-6 text-center text-[11px] text-neutral-600">
            Không phát hiện lỗi QA cho nội dung này.
          </p>
        )}
        {findings.map((f) => {
          const meta = SEVERITY_META[f.severity];
          return (
            <Link
              key={f.id}
              href={f.href}
              className={`group block rounded-lg border border-hairline border-l-2 bg-raised/40 px-3 py-2.5 transition hover:bg-raised ${meta.border}`}
            >
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
                <span className="rounded bg-panel/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-neutral-400">
                  {f.category}
                </span>
                <span className={`ml-auto text-[10px] font-semibold uppercase ${meta.text}`}>
                  {meta.label}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-neutral-200">{f.message}</p>
              <span className="mt-1.5 flex items-center justify-end gap-1 text-[10px] font-medium text-neutral-300 group-hover:text-white">
                {f.action} <UtilIcon name="chevron" width={11} height={11} />
              </span>
            </Link>
          );
        })}
      </CardBody>
    </Card>
  );
}
