import {
  PLATFORM_LABEL,
  type PlatformId,
  type PublishContent,
  canPublishPlatform,
  platformChecklist,
} from '@/lib/mock-data';
import { PlatformPill, PublishStatusBadge } from '../badge';
import { Card, CardBody, CardHeader } from '../card';
import { Icon, UtilIcon } from '../icons';
import { Button } from '../ui';

/** D. Per-Platform Publish Card — gate + nút publish riêng từng nền tảng. */
export function PlatformPublishCard({
  content,
  platform,
}: {
  content: PublishContent;
  platform: PlatformId;
}) {
  const state = content.platforms[platform];
  const checklist = platformChecklist(content, platform);
  const gate = canPublishPlatform(content, platform);
  const isPublished = state.status === 'PUBLISHED';
  const shortName = PLATFORM_LABEL[platform].split(' ')[0];

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title={PLATFORM_LABEL[platform]}
        subtitle={`Kênh: ${state.channel}`}
        accentClass="text-accent-green"
        right={<PublishStatusBadge status={state.status} />}
      />
      <CardBody className="flex flex-1 flex-col gap-3">
        <div className="flex items-center justify-between">
          <PlatformPill platform={platform} />
          <span className="text-[11px] text-neutral-500">
            {state.scheduledAt ?? 'Chưa lên lịch'}
          </span>
        </div>

        <div className="rounded-lg border border-hairline bg-panel/60 px-3 py-2">
          <p className="font-mono text-[10px] text-neutral-300">
            {state.packageFile ?? 'chưa có package'}
          </p>
          <p className="text-[10px] text-neutral-600">
            {state.packageSize ?? '—'} · {content.format}
          </p>
        </div>

        {/* Readiness checklist */}
        <ul className="space-y-1.5">
          {checklist.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-[11px]">
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                  item.ok
                    ? 'bg-accent-green/20 text-accent-green'
                    : 'bg-accent-rose/20 text-accent-rose'
                }`}
              >
                <UtilIcon name={item.ok ? 'check' : 'x'} width={10} height={10} />
              </span>
              <span className={item.ok ? 'text-neutral-300' : 'text-neutral-400'}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-auto space-y-2 pt-1">
          {isPublished ? (
            <Button variant="ghost" disabled className="w-full !opacity-100 text-accent-green">
              <UtilIcon name="check" width={13} height={13} /> Đã publish {shortName}
            </Button>
          ) : (
            <Button
              variant={gate.ok ? 'outline' : 'outline'}
              disabled={true}
              className={`w-full ${gate.ok ? 'border-accent-amber/40 text-accent-amber' : ''}`}
            >
              {gate.ok ? (
                <>
                  <UtilIcon name="clock" width={13} height={13} /> Dry-run planned
                </>
              ) : (
                <>
                  <UtilIcon name="x" width={12} height={12} /> Khóa publish
                </>
              )}
            </Button>
          )}
          {gate.ok ? (
            <p className="text-center text-[9px] text-neutral-500 uppercase tracking-wider">
              Live publish is disabled in UI-04
            </p>
          ) : (
            !isPublished && gate.reason && (
              <p className="text-center text-[10px] text-accent-amber">{gate.reason}</p>
            )
          )}
        </div>
      </CardBody>
    </Card>
  );
}
