/* =============================================================================
 * VFOS Studio — Manual Performance section (P3 Tracking M3–M6)
 * -----------------------------------------------------------------------------
 * Presentational ONLY, READ-ONLY. Hiển thị SỐ THẬT Operator đã lưu vào LOCAL
 * RUNTIME store (qua form Preview & Local Save bên dưới) + breakdown theo kênh
 * (channelId bind từ Phase 1) + so sánh với fixture mock (có nhãn). KHÔNG gọi
 * Facebook/Shopee API, KHÔNG token/secret.
 * ========================================================================== */

import { Badge } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import type {
  LinkRole,
  ManualMetricSource,
  ManualPerformanceSnapshot,
  PerformanceMetric,
} from '@/lib/growth-data/types';
import type { AccentKey } from '@/lib/nav';

const SOURCE_META: Record<ManualMetricSource, { label: string; accent: AccentKey }> = {
  fixture: { label: 'Fixture (demo)', accent: 'blue' },
  manual: { label: 'Nhập tay', accent: 'green' },
  manual_import: { label: 'Import (mock)', accent: 'cyan' },
  api_future: { label: 'API (tương lai)', accent: 'violet' },
};

const ROLE_LABEL: Record<LinkRole, string> = {
  HUB_NATIVE: 'Hub Native CTA',
  CAPTION_LINK: 'Caption Link',
  PINNED_COMMENT: 'Pinned Comment Link',
  REPLY_LINK: 'Reply CTA',
};

function formatNumber(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

function SourceBadge({ source }: { source: ManualMetricSource }) {
  const meta = SOURCE_META[source];
  return <Badge accent={meta.accent}>{meta.label}</Badge>;
}

function Delta({ value }: { value: number }) {
  if (value === 0) return <span className="text-neutral-500">±0</span>;
  const up = value > 0;
  return (
    <span className={up ? 'text-accent-green' : 'text-accent-rose'}>
      {up ? '+' : ''}
      {formatNumber(value)}
    </span>
  );
}

export function ManualPerformanceSection({
  snapshots,
  fixtureMetrics,
  fixturePostIdByJob,
  channelNameById,
}: {
  snapshots: ManualPerformanceSnapshot[];
  fixtureMetrics: PerformanceMetric[];
  /** jobId → publishedPostId của fixture (để so sánh manual vs mock). */
  fixturePostIdByJob: Map<string, string>;
  /** channelId → displayName từ config/channels.json (real only — không fixture). */
  channelNameById: Map<string, string>;
}) {
  const postLevel = snapshots.filter((s) => s.ctaRole === null);
  const roleLevel = snapshots.filter((s) => s.ctaRole !== null);

  // Breakdown M3–M6 theo kênh (channelId bind từ Phase 1; null = chưa gán kênh).
  const byChannel = new Map<
    string,
    { label: string; views: number; clicks: number; conversions: number }
  >();
  for (const s of postLevel) {
    const key = s.channelId ?? '__unbound__';
    const label = s.channelId
      ? (channelNameById.get(s.channelId) ?? `(kênh ${s.channelId} không có trong config)`)
      : '(chưa gán kênh)';
    const row = byChannel.get(key) ?? { label, views: 0, clicks: 0, conversions: 0 };
    row.views += s.views;
    row.clicks += s.clicks;
    row.conversions += s.conversions;
    byChannel.set(key, row);
  }
  const channelRows = [...byChannel.entries()].map(([key, r]) => ({ key, ...r }));

  const totalViews = postLevel.reduce((s, m) => s + m.views, 0);
  const totalClicks = postLevel.reduce((s, m) => s + m.clicks, 0);
  const totalComments = postLevel.reduce((s, m) => s + m.comments, 0);
  const totalConversions = snapshots.reduce((s, m) => s + m.conversions, 0);

  const fixtureByPostId = new Map(fixtureMetrics.map((m) => [m.publishedPostId, m]));

  // So sánh manual (post-level) vs fixture mock cùng publishedPostId.
  const comparison = postLevel
    .map((s) => {
      const postId = s.publishedPostId ?? fixturePostIdByJob.get(s.jobId) ?? null;
      const fx = postId ? fixtureByPostId.get(postId) : undefined;
      if (!fx) return null;
      return {
        snapshotId: s.snapshotId,
        jobId: s.jobId,
        fixtureViews: fx.views,
        manualViews: s.views,
        fixtureClicks: fx.clicks,
        manualClicks: s.clicks,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const kpis = [
    { label: 'Views (nhập tay)', value: totalViews },
    { label: 'Clicks (nhập tay)', value: totalClicks },
    { label: 'Comments (nhập tay)', value: totalComments },
    { label: 'Conversions', value: totalConversions },
  ];

  return (
    <Card>
      <CardHeader
        title="Evidence M3–M6 — Số liệu Operator đã lưu (local runtime)"
        subtitle="Đọc từ local runtime store (gitignored) — số Operator nhập từ Shopee/Meta dashboard qua form bên dưới"
        accentClass="text-accent-cyan"
        right={<Badge accent="cyan">LOCAL RUNTIME · ĐÃ LƯU</Badge>}
      />
      <CardBody className="space-y-5">
        <div className="flex items-center gap-2 rounded-xl border border-accent-amber/30 bg-accent-amber/10 px-3.5 py-2 text-[11px] text-accent-amber">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-amber" />
          <span>
            Chưa gọi Facebook/Shopee API — đây là số Operator tự nhập/import (nguồn ghi trên từng
            dòng). Độ tin cậy phụ thuộc người nhập; dòng nguồn <strong>Import (mock)</strong> là
            dữ liệu thử, không phải số thật.
          </span>
        </div>

        {/* Source legend */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-neutral-600">Nguồn:</span>
          <SourceBadge source="manual" />
          <SourceBadge source="manual_import" />
          <SourceBadge source="fixture" />
          <SourceBadge source="api_future" />
        </div>

        {snapshots.length === 0 ? (
          <p className="py-6 text-center text-xs text-neutral-500">
            Chưa có dữ liệu thật — nhập số từ Shopee/Meta dashboard qua form
            "Preview &amp; Local Save" bên dưới.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {kpis.map((k) => (
                <div key={k.label} className="rounded-xl border border-hairline bg-raised/40 p-3">
                  <p className="text-[10px] text-neutral-500">{k.label}</p>
                  <p className="mt-1 text-lg font-semibold text-neutral-100">
                    {formatNumber(k.value)}
                  </p>
                </div>
              ))}
            </div>

            {/* Breakdown theo kênh — M3–M6 (channelId bind từ Phase 1) */}
            <div>
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                Theo kênh (M3–M6)
              </p>
              <div className="overflow-x-auto rounded-xl border border-hairline">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-neutral-600">
                    <tr className="border-b border-hairline">
                      <th className="px-4 py-2.5 font-medium">Kênh</th>
                      <th className="px-4 py-2.5 font-medium text-right">Views</th>
                      <th className="px-4 py-2.5 font-medium text-right">Clicks (M3)</th>
                      <th className="px-4 py-2.5 font-medium text-right">CTR</th>
                      <th className="px-4 py-2.5 font-medium text-right">Đơn (M4)</th>
                      <th className="px-4 py-2.5 font-medium text-right">CVR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelRows.map((r) => (
                      <tr
                        key={r.key}
                        className="border-b border-hairline/60 last:border-0 hover:bg-raised/30"
                      >
                        <td className="px-4 py-3 text-neutral-200">{r.label}</td>
                        <td className="px-4 py-3 text-right text-neutral-200">
                          {formatNumber(r.views)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-neutral-100">
                          {formatNumber(r.clicks)}
                        </td>
                        <td className="px-4 py-3 text-right text-neutral-300">
                          {r.views > 0 ? `${((r.clicks / r.views) * 100).toFixed(2)}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-accent-green">
                          {formatNumber(r.conversions)}
                        </td>
                        <td className="px-4 py-3 text-right text-neutral-300">
                          {r.clicks > 0 ? `${((r.conversions / r.clicks) * 100).toFixed(2)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1.5 px-1 text-[10px] text-neutral-600">
                Doanh thu (M5) chưa có cột riêng — ghi vào note khi nhập; sẽ thêm field ở round
                sau.
              </p>
            </div>

            {/* Post-level snapshots */}
            <div>
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                Snapshot post-level
              </p>
              <div className="overflow-x-auto rounded-xl border border-hairline">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-neutral-600">
                    <tr className="border-b border-hairline">
                      <th className="px-4 py-2.5 font-medium">Đo lúc (UTC)</th>
                      <th className="px-4 py-2.5 font-medium">Nguồn</th>
                      <th className="px-4 py-2.5 font-medium">Job / Post</th>
                      <th className="px-4 py-2.5 font-medium">Kênh</th>
                      <th className="px-4 py-2.5 font-medium text-right">Views</th>
                      <th className="px-4 py-2.5 font-medium text-right">Clicks</th>
                      <th className="px-4 py-2.5 font-medium text-right">Comments</th>
                      <th className="px-4 py-2.5 font-medium text-right">Conv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {postLevel.map((s) => (
                      <tr
                        key={s.snapshotId}
                        className="border-b border-hairline/60 last:border-0 hover:bg-raised/30"
                      >
                        <td className="px-4 py-3 text-neutral-300">{formatDate(s.measuredAt)}</td>
                        <td className="px-4 py-3">
                          <SourceBadge source={s.source} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-mono text-[10px] text-neutral-300">{s.jobId}</div>
                          <div className="font-mono text-[10px] text-neutral-600">
                            {s.facebookPostId ?? s.publishedPostId ?? 'chưa map post'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[10px] text-neutral-300">
                          {s.channelId
                            ? (channelNameById.get(s.channelId) ?? s.channelId)
                            : '(chưa gán kênh)'}
                        </td>
                        <td className="px-4 py-3 text-right text-neutral-200">
                          {formatNumber(s.views)}
                        </td>
                        <td className="px-4 py-3 text-right text-neutral-200">
                          {formatNumber(s.clicks)}
                        </td>
                        <td className="px-4 py-3 text-right text-neutral-200">
                          {formatNumber(s.comments)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-accent-green">
                          {formatNumber(s.conversions)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* CTA role-level snapshots */}
            {roleLevel.length > 0 && (
              <div>
                <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                  Snapshot theo vai trò CTA
                </p>
                <div className="overflow-x-auto rounded-xl border border-hairline">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead className="text-[10px] uppercase tracking-wider text-neutral-600">
                      <tr className="border-b border-hairline">
                        <th className="px-4 py-2.5 font-medium">Job</th>
                        <th className="px-4 py-2.5 font-medium">CTA role</th>
                        <th className="px-4 py-2.5 font-medium">Nguồn</th>
                        <th className="px-4 py-2.5 font-medium text-right">Clicks</th>
                        <th className="px-4 py-2.5 font-medium text-right">Conv.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roleLevel.map((s) => (
                        <tr
                          key={s.snapshotId}
                          className="border-b border-hairline/60 last:border-0 hover:bg-raised/30"
                        >
                          <td className="px-4 py-3 font-mono text-[10px] text-neutral-300">
                            {s.jobId}
                          </td>
                          <td className="px-4 py-3 text-neutral-200">
                            {s.ctaRole ? ROLE_LABEL[s.ctaRole] : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <SourceBadge source={s.source} />
                          </td>
                          <td className="px-4 py-3 text-right text-neutral-200">
                            {formatNumber(s.clicks)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-accent-green">
                            {formatNumber(s.conversions)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Comparison: manual vs fixture mock */}
            {comparison.length > 0 && (
              <div>
                <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                  So sánh: nhập tay vs fixture (mock)
                </p>
                <div className="overflow-x-auto rounded-xl border border-hairline">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead className="text-[10px] uppercase tracking-wider text-neutral-600">
                      <tr className="border-b border-hairline">
                        <th className="px-4 py-2.5 font-medium">Job</th>
                        <th className="px-4 py-2.5 font-medium text-right">Views (mock)</th>
                        <th className="px-4 py-2.5 font-medium text-right">Views (tay)</th>
                        <th className="px-4 py-2.5 font-medium text-right">Δ views</th>
                        <th className="px-4 py-2.5 font-medium text-right">Clicks (mock)</th>
                        <th className="px-4 py-2.5 font-medium text-right">Clicks (tay)</th>
                        <th className="px-4 py-2.5 font-medium text-right">Δ clicks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.map((c) => (
                        <tr
                          key={c.snapshotId}
                          className="border-b border-hairline/60 last:border-0 hover:bg-raised/30"
                        >
                          <td className="px-4 py-3 font-mono text-[10px] text-neutral-300">
                            {c.jobId}
                          </td>
                          <td className="px-4 py-3 text-right text-neutral-400">
                            {formatNumber(c.fixtureViews)}
                          </td>
                          <td className="px-4 py-3 text-right text-neutral-200">
                            {formatNumber(c.manualViews)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">
                            <Delta value={c.manualViews - c.fixtureViews} />
                          </td>
                          <td className="px-4 py-3 text-right text-neutral-400">
                            {formatNumber(c.fixtureClicks)}
                          </td>
                          <td className="px-4 py-3 text-right text-neutral-200">
                            {formatNumber(c.manualClicks)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">
                            <Delta value={c.manualClicks - c.fixtureClicks} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        <div className="rounded-xl border border-hairline bg-raised/30 px-4 py-3">
          <p className="text-[10px] leading-relaxed text-neutral-500">
            Nhập/import số liệu qua card <strong>"Manual Performance Input — Preview &amp; Local
            Save"</strong> ngay bên dưới: lấy số từ Shopee Affiliate dashboard (clicks/đơn) và Meta
            Business Suite (views) → paste CSV → Validate → Save. Kênh và Facebook post id được hệ
            thống tự gán theo job (Phase 1) khi lưu.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
