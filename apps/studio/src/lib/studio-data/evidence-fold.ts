/* =============================================================================
 * VFOS Studio — Evidence fold thuần (G3 + G1 Slice 5, tách từ jobs.ts để test)
 * -----------------------------------------------------------------------------
 * PURE — không fs, không side effect. jobs.ts bơm snapshot từ runtime stores vào.
 *
 * Luật fold:
 *   - Engagement (views/clicks/conversions) ADDITIVE từ manual post-level
 *     (ctaRole === null — tránh double-count role-level).
 *   - Revenue (M5) theo PRECEDENCE-KHÔNG-SUM giữa tier:
 *       shopee_affiliate_api > manual_csv > manual
 *     — cùng khoản hoa hồng không cộng qua nhiều tier; TRONG cùng tier Shopee,
 *     các kỳ khác nhau (dedupe theo snapshotId ở store) mới được cộng.
 *   - revenueSource='manual' CHỈ khi có snapshot manual mang revenue > 0 — save
 *     route cũ coerce revenue thiếu → 0 nên "0" không phân biệt được "đo được 0"
 *     với "chưa nhập"; hiển thị '—' (qua revenueSource null) là lựa chọn trung
 *     thực hơn "0 đ đã đo" (No-Go #6).
 *   - Shopee snapshot jobId=null (unattributed/partial) BỎ QUA — không đoán job.
 *   - Job không có snapshot nào → KHÔNG có entry (null = chưa đo, không bịa 0).
 *   - Shopee conversions/orderCount KHÔNG fold vào evidence.conversions (spec C.3:
 *     engagement giữ additive manual như hiện tại — tránh double-count với đơn
 *     Operator đã nhập tay). Quyết định scope, xem spec §5-C.
 * ========================================================================== */

import type { ManualPerformanceSnapshot, ShopeeRevenueSnapshot } from '../growth-data/types';
import type { JobEvidenceSummary } from './types';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** periodEnd date-only → cuối ngày ISO để so sánh "mốc đo mới nhất" công bằng
 * với measuredAt datetime (date-only là prefix nên luôn thua nếu so thô). */
function periodEndTimestamp(periodEnd: string): string {
  return DATE_ONLY_RE.test(periodEnd) ? `${periodEnd}T23:59:59.999Z` : periodEnd;
}

export function foldEvidence(
  manualSnapshots: readonly ManualPerformanceSnapshot[],
  shopeeSnapshots: readonly ShopeeRevenueSnapshot[],
): Map<string, JobEvidenceSummary> {
  const map = new Map<string, JobEvidenceSummary>();
  const emptyEntry = (): JobEvidenceSummary => ({
    revenue: 0,
    clicks: 0,
    conversions: 0,
    views: 0,
    snapshotCount: 0,
    lastMeasuredAt: null,
    revenueSource: null,
  });

  for (const s of manualSnapshots) {
    if (s.ctaRole !== null) continue;
    const e = map.get(s.jobId) ?? emptyEntry();
    e.revenue += s.revenue ?? 0;
    e.clicks += s.clicks;
    e.conversions += s.conversions;
    e.views += s.views;
    e.snapshotCount += 1;
    if ((s.revenue ?? 0) > 0) e.revenueSource = 'manual';
    if (!e.lastMeasuredAt || s.measuredAt > e.lastMeasuredAt) e.lastMeasuredAt = s.measuredAt;
    map.set(s.jobId, e);
  }

  // Fold Shopee revenue theo tier. Sum TRONG tier, pick GIỮA tier theo precedence
  // — ghi đè revenue manual, không cộng thêm.
  const shopeeByJob = new Map<
    string,
    { api: number | null; csv: number | null; lastPeriodEnd: string | null }
  >();
  for (const s of shopeeSnapshots) {
    if (!s.jobId) continue;
    const g = shopeeByJob.get(s.jobId) ?? { api: null, csv: null, lastPeriodEnd: null };
    if (s.source === 'shopee_affiliate_api') g.api = (g.api ?? 0) + s.commission;
    else g.csv = (g.csv ?? 0) + s.commission;
    const ts = periodEndTimestamp(s.periodEnd);
    if (!g.lastPeriodEnd || ts > g.lastPeriodEnd) g.lastPeriodEnd = ts;
    shopeeByJob.set(s.jobId, g);
  }
  for (const [jobId, g] of shopeeByJob) {
    const e = map.get(jobId) ?? emptyEntry();
    if (g.api !== null) {
      e.revenue = g.api;
      e.revenueSource = 'shopee_affiliate_api';
    } else if (g.csv !== null) {
      e.revenue = g.csv;
      e.revenueSource = 'manual_csv';
    }
    if (g.lastPeriodEnd && (!e.lastMeasuredAt || g.lastPeriodEnd > e.lastMeasuredAt)) {
      e.lastMeasuredAt = g.lastPeriodEnd;
    }
    map.set(jobId, e);
  }

  return map;
}
