import { Badge } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import { UtilIcon } from '@/components/icons';
import { MockBanner } from '@/components/mock-banner';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui';
import { BGM_LIBRARY, BGM_RULES, SAMPLE_SCRIPT, VOICE_SETTINGS } from '@/lib/mock-data';

export default function ScriptPage() {
  return (
    <div className="space-y-6">
      <MockBanner />
      <PageHeader
        no={6}
        icon="script"
        accent="violet"
        title="Script / Voice / BGM"
        description="Viết kịch bản → cấu hình giọng đọc → chọn nhạc nền. Voice là chính, BGM dẫn mood."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Script */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Kịch bản (Script)"
            subtitle="395 / 1000 ký tự"
            no={6}
            accentClass="text-accent-violet"
            right={
              <Button variant="ghost" className="!py-1.5">
                Tạo lại bằng AI
              </Button>
            }
          />
          <CardBody>
            <textarea
              rows={12}
              defaultValue={SAMPLE_SCRIPT}
              className="w-full resize-none rounded-lg border border-hairline bg-panel/80 px-3.5 py-3 text-xs leading-relaxed text-neutral-200 focus:outline-none focus:ring-1 focus:ring-accent-violet/40"
            />
          </CardBody>
        </Card>

        {/* Voice settings */}
        <Card>
          <CardHeader
            title="Cài đặt giọng đọc"
            subtitle="VFOS brand voice"
            accentClass="text-accent-violet"
          />
          <CardBody className="space-y-2.5">
            {VOICE_SETTINGS.map((s) => (
              <div
                key={s.label}
                className="flex items-center justify-between rounded-lg border border-hairline bg-raised/40 px-3 py-2"
              >
                <span className="text-[11px] text-neutral-500">{s.label}</span>
                <span className="text-xs font-medium text-neutral-200">{s.value}</span>
              </div>
            ))}
            <Button variant="outline" className="w-full">
              <UtilIcon name="play" width={13} height={13} /> Nghe thử voice
            </Button>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* BGM library */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Thư viện BGM"
            subtitle="20 bài xoay vòng — ưu tiên bài ít dùng"
            accentClass="text-accent-violet"
          />
          <CardBody className="space-y-2">
            {BGM_LIBRARY.map((track) => (
              <div
                key={track.id}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 ${
                  track.selected
                    ? 'border-accent-violet/50 bg-accent-violet/10'
                    : 'border-hairline bg-raised/40'
                }`}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-panel text-neutral-300">
                  <UtilIcon name="play" width={14} height={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[11px] text-neutral-200">{track.name}</p>
                  <p className="text-[10px] text-neutral-500">
                    {track.mood} · đã dùng {track.uses} lần
                  </p>
                </div>
                {track.selected ? (
                  <Badge accent="violet">Đang chọn</Badge>
                ) : (
                  <Button variant="ghost" className="!py-1">
                    Chọn
                  </Button>
                )}
              </div>
            ))}
          </CardBody>
        </Card>

        {/* BGM rule */}
        <Card>
          <CardHeader title="Rule bắt buộc" accentClass="text-accent-amber" />
          <CardBody>
            <ul className="space-y-2 text-xs text-neutral-300">
              {BGM_RULES.map((r) => (
                <li key={r} className="flex items-start gap-2">
                  <span className="mt-0.5 text-accent-amber">▲</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
