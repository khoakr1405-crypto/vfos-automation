import { StatusBadge } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import { Icon, UtilIcon } from '@/components/icons';
import { MockBanner } from '@/components/mock-banner';
import { PageHeader } from '@/components/page-header';
import { Button, FakeSelect, Field } from '@/components/ui';
import { RAW_VISUALS, RAW_VISUAL_ENGINES } from '@/lib/mock-data';

export default function RawVisualPage() {
  return (
    <div className="space-y-6">
      <MockBanner />
      <PageHeader
        no={5}
        icon="rawvisual"
        accent="violet"
        title="Raw Visual AI"
        description="Tạo / thu thập video raw 9:16 từ AI engine hoặc upload. Đầu vào cho bước Script/Voice."
        actions={
          <Button variant="primary">
            <UtilIcon name="plus" /> Upload raw visual
          </Button>
        }
      />

      {/* Engine tabs (presentational) */}
      <div className="flex flex-wrap gap-2">
        {RAW_VISUAL_ENGINES.map((engine, i) => (
          <Button key={engine} variant={i === 0 ? 'primary' : 'outline'} className="!py-1.5">
            {engine}
          </Button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Prompt panel */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Tạo prompt raw visual"
            subtitle="Engine mock — không gọi API thật"
            no={5}
            accentClass="text-accent-violet"
          />
          <CardBody className="space-y-4">
            <Field label="Mô tả cảnh (không lồng voice / nhạc / caption)">
              <textarea
                rows={5}
                defaultValue="Video 9:16 giới thiệu máy rửa xe mini, quay cận cảnh sản phẩm, ánh sáng tự nhiên, ưu tiên người mới, không chữ, không watermark."
                className="w-full resize-none rounded-lg border border-hairline bg-panel/80 px-3 py-2.5 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-accent-violet/40"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Tỷ lệ">
                <FakeSelect value="9:16" />
              </Field>
              <Field label="Thời lượng">
                <FakeSelect value="15 – 20s" />
              </Field>
              <Field label="Engine">
                <FakeSelect value="TopView (mock)" />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button variant="primary">
                <Icon name="rawvisual" width={14} height={14} /> Tạo prompt
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Rule reminder */}
        <Card>
          <CardHeader title="Nguyên tắc raw visual" accentClass="text-accent-violet" />
          <CardBody>
            <ul className="space-y-2 text-xs text-neutral-300">
              <li className="flex gap-2">
                <span className="text-accent-violet">●</span> Raw = hình ảnh thuần, KHÔNG voice /
                nhạc / caption.
              </li>
              <li className="flex gap-2">
                <span className="text-accent-violet">●</span> Luôn 9:16 cho Reels / TikTok / Shorts.
              </li>
              <li className="flex gap-2">
                <span className="text-accent-violet">●</span> Không watermark — QA sẽ reject nếu có.
              </li>
              <li className="flex gap-2">
                <span className="text-accent-violet">●</span> Voice + BGM được thêm ở module sau.
              </li>
            </ul>
          </CardBody>
        </Card>
      </div>

      {/* Generated raw list */}
      <Card>
        <CardHeader
          title="Video raw đã tạo"
          subtitle={`${RAW_VISUALS.length} clip (mock — không có file thật trong repo)`}
          accentClass="text-accent-violet"
        />
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RAW_VISUALS.map((rv) => (
            <div
              key={rv.id}
              className="overflow-hidden rounded-xl border border-hairline bg-raised/40"
            >
              <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-panel to-card">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-neutral-200">
                  <UtilIcon name="play" width={18} height={18} />
                </span>
                <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-neutral-300">
                  {rv.duration} · {rv.ratio}
                </span>
              </div>
              <div className="space-y-1 px-3.5 py-3">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[11px] text-neutral-200">{rv.file}</p>
                  <StatusBadge status={rv.status} />
                </div>
                <p className="text-[10px] text-neutral-500">{rv.engine}</p>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
