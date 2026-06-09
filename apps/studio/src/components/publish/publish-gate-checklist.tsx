import { contentGateChecklist, contentGatePassed } from '@/lib/mock-data';
import type { PublishContent } from '@/lib/types';
import { StatusBadge } from '../badge';
import { Card, CardBody, CardHeader } from '../card';
import { UtilIcon } from '../icons';

/** E. Publish Gate Checklist — gate chung của nội dung (logic gate hiển thị rõ). */
export function PublishGateChecklist({ content }: { content: PublishContent }) {
  // Use real gate checks if available, otherwise map mock data
  const hasRealGates = !!content.gateChecks;
  const realGates = content.gateChecks || [];

  const mockItems = contentGateChecklist(content);
  const mockPassed = contentGatePassed(content);

  const passed = hasRealGates
    ? realGates.every((g) => g.status === 'pass' || g.status === 'warn')
    : mockPassed;

  return (
    <Card>
      <CardHeader
        title="Publish Gate — điều kiện chung"
        subtitle="Phải xanh hết (hoặc cảnh báo) thì các nút publish nền tảng mới mở khóa"
        accentClass="text-accent-green"
        right={<StatusBadge status={passed ? 'pass' : 'blocked'} />}
      />
      <CardBody className="grid gap-2 sm:grid-cols-2">
        {hasRealGates
          ? realGates.map((gate) => {
              const isPass = gate.status === 'pass';
              const isFail = gate.status === 'fail';
              const isWarn = gate.status === 'warn';

              let statusClass = 'bg-neutral-800 text-neutral-400';
              let iconName: 'check' | 'x' | 'clock' | 'bell' = 'clock';

              if (isPass) {
                statusClass = 'bg-accent-green/20 text-accent-green';
                iconName = 'check';
              } else if (isFail) {
                statusClass = 'bg-accent-rose/20 text-accent-rose';
                iconName = 'x';
              } else if (isWarn) {
                statusClass = 'bg-accent-amber/20 text-accent-amber';
                iconName = 'bell';
              }

              return (
                <div
                  key={gate.label}
                  className="flex items-start gap-2.5 rounded-lg border border-hairline bg-raised/40 px-3 py-2"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full mt-0.5 ${statusClass}`}
                  >
                    <UtilIcon name={iconName} width={12} height={12} />
                  </span>
                  <div>
                    <span className="text-xs font-semibold text-neutral-200 block">
                      {gate.label}
                    </span>
                    {gate.detail && (
                      <span className="text-[10px] text-neutral-500 block leading-tight mt-0.5">
                        {gate.detail}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          : mockItems.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-2.5 rounded-lg border border-hairline bg-raised/40 px-3 py-2"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    item.ok
                      ? 'bg-accent-green/20 text-accent-green'
                      : 'bg-accent-rose/20 text-accent-rose'
                  }`}
                >
                  <UtilIcon name={item.ok ? 'check' : 'x'} width={12} height={12} />
                </span>
                <span className="text-xs text-neutral-200">{item.label}</span>
              </div>
            ))}
        <p className="sm:col-span-2 mt-1 text-[11px] text-neutral-500">
          Yêu cầu riêng từng nền tảng (package, thumbnail, manual review) kiểm tra trong từng card
          bên dưới.
        </p>
      </CardBody>
    </Card>
  );
}
