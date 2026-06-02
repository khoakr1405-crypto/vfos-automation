'use client';

import type { QaJob, RiskLevel } from '@/lib/mock-data';
import type { AccentKey } from '@/lib/nav';
import { Badge, LanePill, PlatformPill, QaStatusBadge } from '../badge';
import { Card, CardBody, CardHeader } from '../card';
import { Icon } from '../icons';

const OPERATOR_BADGE: Record<string, string> = {
  pending: 'NEEDS_OPERATOR_REVIEW',
  approved: 'APPROVED',
  rejected: 'REJECTED',
};
const RISK_ACCENT: Record<RiskLevel, AccentKey> = { high: 'rose', medium: 'amber', low: 'blue' };

/** B. QA Queue — chọn 1 nội dung để xem chi tiết QA bên dưới. */
export function QaQueueTable({
  items,
  selectedId,
  onSelect,
}: {
  items: QaJob[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader
        title="Hàng đợi QA"
        subtitle={`${items.length} nội dung · bấm để xem chi tiết kiểm tra`}
        no={8}
        accentClass="text-accent-green"
      />
      <CardBody className="!p-0 overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-neutral-600">
            <tr className="border-b border-hairline">
              <th className="px-5 py-2.5 font-medium">Nội dung</th>
              <th className="px-3 py-2.5 font-medium">Ngách</th>
              <th className="px-3 py-2.5 font-medium">QA</th>
              <th className="px-3 py-2.5 font-medium">Operator</th>
              <th className="px-3 py-2.5 font-medium">Risk</th>
              <th className="px-3 py-2.5 font-medium">Nền tảng</th>
            </tr>
          </thead>
          <tbody>
            {items.map((j) => {
              const selected = j.id === selectedId;
              return (
                <tr
                  key={j.id}
                  onClick={() => onSelect(j.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(j.id);
                    }
                  }}
                  tabIndex={0}
                  className={`cursor-pointer border-b border-hairline/60 last:border-0 transition focus:outline-none focus-visible:bg-raised/40 ${
                    selected ? 'bg-accent-green/10' : 'hover:bg-raised/30'
                  }`}
                >
                  <td className={`px-5 py-3 ${selected ? 'border-l-2 border-l-accent-green' : ''}`}>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-raised to-panel text-neutral-500">
                        <Icon name="qa" width={15} height={15} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-neutral-100">{j.title}</p>
                        <p className="truncate font-mono text-[10px] text-neutral-600">
                          {j.id} · {j.product}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <LanePill laneId={j.laneId} />
                  </td>
                  <td className="px-3 py-3">
                    <QaStatusBadge status={j.qaStatus} />
                  </td>
                  <td className="px-3 py-3">
                    <QaStatusBadge status={OPERATOR_BADGE[j.operatorStatus] ?? j.operatorStatus} />
                  </td>
                  <td className="px-3 py-3">
                    <Badge accent={RISK_ACCENT[j.risk]}>{j.risk.toUpperCase()}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {j.targets.map((p) => (
                        <PlatformPill key={p} platform={p} />
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}
