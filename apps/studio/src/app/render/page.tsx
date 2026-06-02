import { Card, CardBody, CardHeader } from '@/components/card';
import { Icon, UtilIcon } from '@/components/icons';
import { MockBanner } from '@/components/mock-banner';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui';
import { RENDER_SETTINGS } from '@/lib/mock-data';

export default function RenderPage() {
  return (
    <div className="space-y-6">
      <MockBanner />
      <PageHeader
        no={7}
        icon="render"
        accent="cyan"
        title="Render & Caption"
        description="Ghép video + voice + BGM + caption động → bản preview chờ QA. Caption an toàn safe-area."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Render config */}
        <Card>
          <CardHeader
            title="Cấu hình render"
            subtitle="Mock config"
            no={7}
            accentClass="text-accent-cyan"
          />
          <CardBody className="space-y-2.5">
            {RENDER_SETTINGS.map((s) => (
              <div
                key={s.label}
                className="flex items-center justify-between rounded-lg border border-hairline bg-raised/40 px-3 py-2"
              >
                <span className="text-[11px] text-neutral-500">{s.label}</span>
                <span className="text-xs font-medium text-neutral-200">{s.value}</span>
              </div>
            ))}
            <Button variant="primary" className="w-full">
              <Icon name="render" width={14} height={14} /> Render preview
            </Button>
          </CardBody>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader
            title="Preview video"
            subtitle="Bản nháp chờ QA (mock)"
            accentClass="text-accent-cyan"
          />
          <CardBody>
            <div className="relative mx-auto flex aspect-[9/16] max-h-[26rem] w-full max-w-xs items-center justify-center overflow-hidden rounded-2xl border border-hairline bg-gradient-to-b from-raised via-panel to-card">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/40 text-neutral-100">
                <UtilIcon name="play" width={22} height={22} />
              </span>
              {/* caption mock */}
              <div className="absolute bottom-14 left-1/2 -translate-x-1/2 rounded-md bg-black/50 px-3 py-1 text-center">
                <span className="text-sm font-extrabold uppercase tracking-wide text-white [text-shadow:_0_1px_2px_rgb(0_0_0)]">
                  Rửa xe sạch như mới
                </span>
              </div>
              <div className="absolute inset-x-3 top-3 flex justify-between text-[10px] text-neutral-400">
                <span>00:05 / 00:15</span>
                <span>9:16 · 1080×1920</span>
              </div>
            </div>
            <div className="mt-3 flex justify-center gap-2">
              <Button variant="outline">Xem trước full</Button>
              <Button variant="success">
                <UtilIcon name="check" width={13} height={13} /> Gửi sang QA
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
