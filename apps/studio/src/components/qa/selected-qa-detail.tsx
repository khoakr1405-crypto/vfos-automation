import { type QaJob, SHOPEE_OWNER } from '@/lib/mock-data';
import { Badge, LanePill, PlatformPill, QaStatusBadge, StatusBadge } from '../badge';
import { Card, CardBody, CardHeader } from '../card';
import { UtilIcon } from '../icons';

const OPERATOR_BADGE: Record<string, string> = {
  pending: 'NEEDS_OPERATOR_REVIEW',
  approved: 'APPROVED',
  rejected: 'REJECTED',
};

/** C. Selected QA Detail — preview + product + trạng thái QA/operator. */
export function SelectedQaDetail({ job }: { job: QaJob }) {
  return (
    <Card>
      <CardHeader
        title="Nội dung đang kiểm"
        subtitle={`${job.id} · ${job.title}`}
        no={8}
        accentClass="text-accent-green"
        right={<LanePill laneId={job.laneId} />}
      />
      <CardBody className="grid gap-4 sm:grid-cols-[150px_1fr]">
        <div className="relative mx-auto flex aspect-[9/16] w-full max-w-[150px] items-center justify-center overflow-hidden rounded-xl border border-hairline bg-gradient-to-b from-raised to-card">
          <UtilIcon name="play" width={22} height={22} />
          <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-neutral-300">
            {job.duration} · 9:16
          </span>
        </div>

        <div className="space-y-3">
          {/* QA + operator status */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-neutral-500">QA:</span>
            <QaStatusBadge status={job.qaStatus} />
            <span className="ml-2 text-[11px] text-neutral-500">Operator:</span>
            <QaStatusBadge status={OPERATOR_BADGE[job.operatorStatus] ?? job.operatorStatus} />
            <span className="ml-auto text-[10px] text-neutral-500">
              Risk: <span className="font-semibold text-neutral-300">{job.risk.toUpperCase()}</span>
            </span>
          </div>

          {/* Product card */}
          <div className="rounded-xl border border-hairline bg-raised/40 px-3.5 py-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-neutral-100">{job.product}</p>
              <span className="text-xs font-semibold text-accent-green">{job.productPrice}</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <UtilIcon name="link" width={13} height={13} className="shrink-0 text-accent-blue" />
              <span className="truncate font-mono text-[10px] text-accent-blue">
                {job.affiliateLink}
              </span>
            </div>
            <div className="mt-1.5">
              <Badge accent={job.ownerValid ? 'green' : 'rose'}>
                owner_id {SHOPEE_OWNER} · {job.ownerValid ? 'hợp lệ' : 'KHÔNG khớp'}
              </Badge>
            </div>
          </div>

          {/* Target platforms */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-neutral-500">Nền tảng đích:</span>
            {job.targets.map((p) => (
              <PlatformPill key={p} platform={p} />
            ))}
          </div>

          {/* Voice / BGM / Caption / Package */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <StatusRow label="Voice" status={job.voiceStatus} />
            <StatusRow label="BGM" status={job.bgmStatus} />
            <StatusRow label="Caption" status={job.captionStatus} />
            <StatusRow label="Render package" status={job.packageStatus} />
          </div>

          {job.rejectReason && (
            <p className="rounded-lg border border-accent-rose/30 bg-accent-rose/10 px-3 py-2 text-[11px] text-accent-rose">
              Lý do reject: {job.rejectReason}
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function StatusRow({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-hairline bg-raised/40 px-3 py-2">
      <span className="text-neutral-400">{label}</span>
      <StatusBadge status={status} />
    </div>
  );
}
