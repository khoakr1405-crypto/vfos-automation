import { Card, CardBody } from '@/components/card';
import { MockBanner } from '@/components/mock-banner';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui';
import {
  LANES,
  PLATFORMS,
  PLATFORM_LABEL,
  SCHEDULE_ITEMS,
  TIME_SLOTS,
  WEEK_DAYS,
} from '@/lib/mock-data';
import { ACCENT_BG_SOFT, type AccentKey } from '@/lib/nav';

const platformAccent = (id: string): AccentKey =>
  PLATFORMS.find((p) => p.id === id)?.accent ?? 'blue';

export default function SchedulePage() {
  return (
    <div className="space-y-6">
      <MockBanner />
      <PageHeader
        no={11}
        icon="schedule"
        accent="amber"
        title="Lịch xuất bản đa nền tảng"
        description="Khung giờ đăng theo tuần cho Facebook / TikTok / YouTube. Mỗi mục vẫn cần duyệt + publish tay."
        actions={
          <>
            <Button variant="ghost" className="!py-1.5">
              Ngày
            </Button>
            <Button variant="outline" className="!py-1.5">
              Tuần
            </Button>
            <Button variant="ghost" className="!py-1.5">
              Tháng
            </Button>
          </>
        }
      />

      {/* Platform legend */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-neutral-400">
        <span>Nền tảng:</span>
        {PLATFORMS.map((p) => (
          <span key={p.id} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${ACCENT_BG_SOFT[p.accent].split(' ')[0]}`} />
            {p.label}
          </span>
        ))}
        <span className="ml-auto">26/05 – 01/06/2026</span>
      </div>

      <Card>
        <CardBody className="!p-0 overflow-x-auto">
          <div className="min-w-[820px]">
            {/* header row */}
            <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-hairline">
              <div className="px-2 py-3" />
              {WEEK_DAYS.map((d) => (
                <div
                  key={d}
                  className="border-l border-hairline px-2 py-3 text-center text-[11px] font-medium text-neutral-300"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* time-slot rows */}
            {TIME_SLOTS.map((slot, slotIdx) => (
              <div
                key={slot}
                className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-hairline/60 last:border-0"
              >
                <div className="px-2 py-3 text-right text-[10px] text-neutral-600">{slot}</div>
                {WEEK_DAYS.map((day, dayIdx) => {
                  const items = SCHEDULE_ITEMS.filter(
                    (it) => it.day === dayIdx && it.slot === slotIdx,
                  );
                  return (
                    <div
                      key={`${slot}-${day}`}
                      className="min-h-[64px] border-l border-hairline/60 p-1.5"
                    >
                      {items.map((it) => {
                        const lane = LANES.find((l) => l.id === it.laneId);
                        return (
                          <div
                            key={`${it.day}-${it.slot}-${it.platform}`}
                            className={`rounded-lg border-l-2 px-2 py-1.5 text-[10px] ${ACCENT_BG_SOFT[platformAccent(it.platform)]}`}
                            style={{ borderLeftColor: 'currentColor' }}
                          >
                            <p className="font-semibold">{PLATFORM_LABEL[it.platform]}</p>
                            <p className="truncate text-neutral-300">{it.title}</p>
                            <p className="text-neutral-500">{lane?.label}</p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
