import type { CheckState, QaCheckItem } from '@/lib/mock-data';
import { Card, CardBody, CardHeader } from '../card';
import { UtilIcon } from '../icons';

const STATE_STYLE: Record<CheckState, string> = {
  pass: 'bg-accent-green/20 text-accent-green',
  fail: 'bg-accent-rose/20 text-accent-rose',
  warn: 'bg-accent-amber/20 text-accent-amber',
};

function StateIcon({ state }: { state: CheckState }) {
  if (state === 'warn') {
    return <span className="text-[11px] font-bold leading-none">!</span>;
  }
  return <UtilIcon name={state === 'pass' ? 'check' : 'x'} width={11} height={11} />;
}

/** Generic checklist card — dùng cho QA kỹ thuật / nội dung / affiliate (D/E/F). */
export function QaChecklistCard({
  title,
  subtitle,
  items,
  accentClass = 'text-accent-green',
}: {
  title: string;
  subtitle?: string;
  items: QaCheckItem[];
  accentClass?: string;
}) {
  const fail = items.filter((i) => i.state === 'fail').length;
  const warn = items.filter((i) => i.state === 'warn').length;
  const summary = fail > 0 ? `${fail} FAIL` : warn > 0 ? `${warn} WARN` : 'PASS';
  const summaryColor =
    fail > 0 ? 'text-accent-rose' : warn > 0 ? 'text-accent-amber' : 'text-accent-green';

  return (
    <Card className="h-full">
      <CardHeader
        title={title}
        subtitle={subtitle}
        accentClass={accentClass}
        right={<span className={`text-[11px] font-semibold ${summaryColor}`}>{summary}</span>}
      />
      <CardBody className="space-y-1.5">
        {items.map((item) => (
          <div key={item.label} className="flex items-start gap-2.5">
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${STATE_STYLE[item.state]}`}
            >
              <StateIcon state={item.state} />
            </span>
            <div className="min-w-0">
              <span
                className={`text-[11px] ${item.state === 'pass' ? 'text-neutral-300' : 'text-neutral-100'}`}
              >
                {item.label}
              </span>
              {item.note && <p className="text-[10px] text-accent-amber">{item.note}</p>}
            </div>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
