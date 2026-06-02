import { PLATFORMS, type PublishContent, SHOPEE_OWNER } from '@/lib/mock-data';
import { Badge, LanePill, StatusBadge } from '../badge';
import { Card, CardBody, CardHeader } from '../card';
import { UtilIcon } from '../icons';

/** C. Selected Content Publish Detail — preview + product card + trạng thái. */
export function SelectedPublishContent({ content }: { content: PublishContent }) {
  const facts: { label: string; value: string }[] = [
    { label: 'Thời lượng', value: content.duration },
    { label: 'Định dạng', value: content.format },
  ];

  return (
    <Card>
      <CardHeader
        title="Nội dung đang chọn"
        subtitle={content.title}
        no={9}
        accentClass="text-accent-green"
        right={<LanePill laneId={content.laneId} />}
      />
      <CardBody className="grid gap-4 sm:grid-cols-[150px_1fr]">
        {/* Preview */}
        <div className="relative mx-auto flex aspect-[9/16] w-full max-w-[150px] items-center justify-center overflow-hidden rounded-xl border border-hairline bg-gradient-to-b from-raised to-card">
          <UtilIcon name="play" width={22} height={22} />
          <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-neutral-300">
            {content.duration} · 9:16
          </span>
        </div>

        {/* Product + statuses */}
        <div className="space-y-3">
          {/* Safety Alert (Enforced in UI-04) */}
          <div className="rounded-xl border border-accent-amber/20 bg-accent-amber/5 px-3.5 py-2.5 text-[11px] text-accent-amber flex gap-2.5 items-start">
            <UtilIcon name="bell" width={14} height={14} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">VFOS Studio Safety Notice (UI-04):</p>
              <ul className="list-disc pl-3.5 mt-0.5 space-y-0.5 text-neutral-400">
                <li><span className="text-accent-amber font-medium">Live publish is disabled in UI-04</span> (Read-only environment)</li>
                <li><span className="text-accent-amber font-medium">Approve does not publish</span> (Chỉ chuẩn bị gói đóng gói trung gian)</li>
                <li>Hệ thống tách biệt hoàn toàn chạy Dry-Run, không có side effects.</li>
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-hairline bg-raised/40 px-3.5 py-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-neutral-100">{content.product}</p>
              <span className="text-xs font-semibold text-accent-green">
                {content.productPrice}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <UtilIcon name="link" width={13} height={13} className="shrink-0 text-accent-blue" />
              <span className="truncate font-mono text-[10px] text-accent-blue">
                {content.affiliateLink}
              </span>
            </div>
            <div className="mt-1.5">
              <Badge accent={content.ownerValid ? 'green' : 'rose'}>
                owner_id {SHOPEE_OWNER} · {content.ownerValid ? 'hợp lệ' : 'KHÔNG khớp'}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <StatusRow label="QA" status={content.qaPassed ? 'pass' : 'fail'} />
            <StatusRow label="Operator duyệt" status={content.approved ? 'approved' : 'pending'} />
            <StatusRow label="Caption" status={content.captionReady ? 'pass' : 'fail'} />
            <StatusRow label="Voice & BGM" status={content.voiceBgmReady ? 'pass' : 'fail'} />
          </div>

          <div className="flex flex-wrap gap-3">
            {facts.map((f) => (
              <span key={f.label} className="text-[11px] text-neutral-500">
                {f.label}: <span className="text-neutral-200">{f.value}</span>
              </span>
            ))}
          </div>

          {/* Package list per platform */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-neutral-400">Package theo nền tảng</p>
            {PLATFORMS.map((p) => {
              const s = content.platforms[p.id];
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-hairline bg-panel/60 px-3 py-1.5"
                >
                  <span className="text-[11px] text-neutral-400">{p.label}</span>
                  <span className="font-mono text-[10px] text-neutral-300">
                    {s.packageFile ? `${s.packageFile} · ${s.packageSize}` : 'chưa có package'}
                  </span>
                </div>
              );
            })}
          </div>
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
