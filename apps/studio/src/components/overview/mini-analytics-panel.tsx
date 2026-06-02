'use client';

import { Badge } from '../badge';
import { Card, CardBody, CardHeader } from '../card';
import { UtilIcon } from '../icons';

interface ChannelAnalytics {
  channel: string;
  platform: 'facebook' | 'tiktok' | 'youtube';
  lane: string;
  published: number;
  views: string;
  clicks: string;
  ctr: string;
  trend: 'up' | 'down';
  warning?: string;
}

const ANALYTICS_DATA: ChannelAnalytics[] = [
  {
    channel: 'TikTok Review 01',
    platform: 'tiktok',
    lane: 'Review sản phẩm',
    published: 14,
    views: '18.2K',
    clicks: '880',
    ctr: '4.83%',
    trend: 'up',
  },
  {
    channel: 'FB Reels Reviewer',
    platform: 'facebook',
    lane: 'Review sản phẩm',
    published: 8,
    views: '7.5K',
    clicks: '240',
    ctr: '3.20%',
    trend: 'down',
    warning:
      'Warning: CTR dropped for 3 consecutive days. Investigate: hook quality, product fit, CTA strength, source video quality.',
  },
  {
    channel: 'YouTube Review Shorts',
    platform: 'youtube',
    lane: 'Review sản phẩm',
    published: 2,
    views: '2.8K',
    clicks: '80',
    ctr: '2.85%',
    trend: 'up',
  },
];

export function MiniAnalyticsPanel() {
  return (
    <Card>
      <CardHeader
        title="Báo cáo hiệu suất theo Kênh"
        subtitle="Theo dõi Lượt xem (Views), Lượt click (Clicks) và CTR thực tế để đánh giá chất lượng video"
        accentClass="text-accent-green"
      />
      <CardBody className="space-y-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-hairline text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                <th className="px-4 py-2.5">Kênh vận hành</th>
                <th className="px-4 py-2.5">Nền tảng</th>
                <th className="px-4 py-2.5">Ngách (Lane)</th>
                <th className="px-4 py-2.5 text-center">Video đã đăng</th>
                <th className="px-4 py-2.5 text-right">Lượt xem</th>
                <th className="px-4 py-2.5 text-right">Lượt click</th>
                <th className="px-4 py-2.5 text-right">CTR</th>
                <th className="px-4 py-2.5 text-center">Xu hướng</th>
              </tr>
            </thead>
            <tbody>
              {ANALYTICS_DATA.map((row) => (
                <tr
                  key={row.channel}
                  className="border-b border-hairline/50 last:border-0 hover:bg-raised/20 transition"
                >
                  <td className="px-4 py-3 font-semibold text-neutral-200">{row.channel}</td>
                  <td className="px-4 py-3">
                    <span className="capitalize">{row.platform}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge accent="blue">{row.lane}</Badge>
                  </td>
                  <td className="px-4 py-3 text-center font-medium text-neutral-300">
                    {row.published}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-neutral-200">
                    {row.views}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-neutral-200">
                    {row.clicks}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-bold ${row.trend === 'up' ? 'text-accent-green' : 'text-accent-rose'}`}
                  >
                    {row.ctr}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.trend === 'up' ? (
                      <span className="text-accent-green font-bold flex items-center justify-center gap-0.5">
                        <UtilIcon name="chevron" className="-rotate-90" width={10} height={10} />{' '}
                        Tăng
                      </span>
                    ) : (
                      <span className="text-accent-rose font-bold flex items-center justify-center gap-0.5">
                        <UtilIcon name="chevron" className="rotate-90" width={10} height={10} />{' '}
                        Giảm
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Warnings & Suggestions Panel */}
        <div className="space-y-2">
          {ANALYTICS_DATA.filter((r) => r.warning).map((row) => (
            <div
              key={row.channel}
              className="rounded-xl border border-accent-amber/20 bg-accent-amber/5 p-3.5 flex items-start gap-3 text-xs"
            >
              <div className="h-7 w-7 rounded-lg bg-accent-amber/10 text-accent-amber flex items-center justify-center shrink-0 mt-0.5">
                <UtilIcon name="bell" width={14} height={14} />
              </div>
              <div className="space-y-1">
                <p className="font-bold text-accent-amber">
                  CẢNH BÁO: Hiệu suất CTR suy giảm trên kênh {row.channel}
                </p>
                <p className="text-neutral-300 leading-relaxed font-mono text-[11px] bg-neutral-950/80 p-2.5 rounded-lg border border-hairline/60">
                  {row.warning}
                </p>
                <p className="text-[10px] text-neutral-500 italic mt-1">
                  *Lưu ý: Hệ thống chỉ cảnh báo chỉ số và gợi ý kiểm tra, không tự động điều chỉnh
                  cấu trúc lane.
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
