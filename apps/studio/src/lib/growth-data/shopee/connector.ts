/* =============================================================================
 * VFOS Studio — Shopee revenue connector (G1 — Revenue Attribution §5-C C.2)
 * -----------------------------------------------------------------------------
 * PURE logic, KHÔNG node:fs, KHÔNG network — caller (route/test) bơm context vào.
 * Deliverable round này: interface + ManualCsvShopeeConnector (parse/validate/
 * attribute 1 dòng CSV Shopee export → ShopeeRevenueSnapshot chuẩn hoá).
 * ShopeeAffiliateApiConnector CHỈ là stub khai báo — KHÔNG implement (No-Go #2).
 *
 * Attribution (No-Go #7 — không đoán):
 *   - khớp affiliateShortLink === PublishedPost.affiliateShortLink, hoặc
 *     itemId === PublishedPost.productId;
 *   - đúng 1 job  → jobId + 'success';
 *   - nhiều job   → jobId null + 'partial' (note ghi ứng viên, KHÔNG chọn bừa);
 *   - không khớp  → jobId null + 'unattributed'.
 *
 * CSV cột (theo thứ tự, header optional, dòng '#' bỏ qua):
 *   affiliateShortLink,itemId,shopId,periodStart,periodEnd,orderCount,
 *   conversions,gmv,commission,orderRef
 * - orderRef optional: ref công khai của kỳ đối soát (vd mã batch export) — chỉ
 *   dùng làm khóa dedupe, KHÔNG phải mã đơn chứa PII.
 * - Tiền VND SỐ NGUYÊN (đồng). Số âm/thập phân → reject dòng.
 * ========================================================================== */

import type {
  PublishedPost,
  ShopeeIngestStatus,
  ShopeeRevenueSnapshot,
  ShopeeSource,
} from '../types';

export interface ShopeeIngestResult {
  snapshots: ShopeeRevenueSnapshot[];
  rejected: Array<{ reason: string }>;
}

export interface ShopeeRevenueConnector {
  readonly source: ShopeeSource;
  ingest(input: unknown): Promise<ShopeeIngestResult>;
}

/** Context attribution — danh sách bài đã đăng THẬT (store §4 + derive). */
export interface ShopeeAttributionContext {
  publishedPosts: readonly PublishedPost[];
}

const slug = (s: string): string =>
  s
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

/**
 * snapshotId deterministic theo TOÀN BỘ định danh dòng (không chỉ orderRef —
 * orderRef là mã batch nên NHIỀU dòng cùng batch/kỳ từng va chạm id → dòng tiền
 * bị dedupe nuốt lặng lẽ). Re-import đúng cùng dòng ⇒ cùng id ⇒ dedupe idempotent.
 */
export function deriveShopeeSnapshotId(d: {
  jobId: string | null;
  periodStart: string;
  periodEnd: string;
  orderRef: string | null;
  affiliateShortLink: string | null;
  itemId: string | null;
}): string {
  const anchor = d.jobId ?? 'unattributed';
  const parts = [
    slug(anchor),
    slug(d.periodStart),
    slug(d.periodEnd),
    slug(d.itemId ?? 'noitem'),
    slug(d.affiliateShortLink ?? 'nolink'),
    slug(d.orderRef ?? 'noref'),
  ];
  return `srs_${parts.join('__')}`;
}

/** Header = ô ĐẦU TIÊN đúng tên cột 'affiliateshortlink' — không dò substring
 * cả dòng (dòng data có 'gmv'/'commission' trong orderRef từng bị nuốt nhầm). */
function isHeaderLine(line: string): boolean {
  return (line.split(',')[0] ?? '').trim().toLowerCase() === 'affiliateshortlink';
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse 1 ô tiền/đếm: CHỈ chuỗi digit thuần (VND đồng, số nguyên ≥ 0). Chặn
 * '500.000' (Number() hiểu là 500 — sai 1000 lần), '1e3', '0x10'. Sai → null. */
function intNonNeg(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

/**
 * Connector CSV manual (Operator export từ Shopee Affiliate dashboard → paste).
 * PURE: không fs, không network, không side effect — chỉ map + validate + attribute.
 */
export class ManualCsvShopeeConnector implements ShopeeRevenueConnector {
  readonly source = 'manual_csv' as const;

  constructor(private readonly ctx: ShopeeAttributionContext) {}

  ingest(input: unknown): Promise<ShopeeIngestResult> {
    const snapshots: ShopeeRevenueSnapshot[] = [];
    const rejected: Array<{ reason: string }> = [];

    if (typeof input !== 'string' || input.trim() === '') {
      rejected.push({ reason: 'input phải là CSV text không rỗng' });
      return Promise.resolve({ snapshots, rejected });
    }

    let dataLine = 0;
    let headerCandidate = true;
    for (const rawLine of input.split(/\r?\n/)) {
      const trimmed = rawLine.trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;
      // Header chỉ được nhận ở DÒNG ĐẦU (trước mọi dòng data) — dòng data chứa
      // chữ 'gmv'/'commission' trong orderRef không bị nuốt lặng lẽ như header.
      if (headerCandidate && isHeaderLine(trimmed)) {
        headerCandidate = false;
        continue;
      }
      headerCandidate = false;
      dataLine += 1;

      const cells = trimmed.split(',').map((c) => c.trim());
      // Đúng 9-10 cột (orderRef optional). Nhiều hơn = có dấu phẩy lạc (vd tiền
      // '500,000' bị tách cột → mọi cột sau lệch, tiền sai lặng lẽ) → reject.
      if (cells.length < 9 || cells.length > 10) {
        rejected.push({
          reason: `dòng ${dataLine}: cần đúng 9-10 cột, đang có ${cells.length} — kiểm tra dấu phẩy trong ô tiền (bỏ ngăn cách nghìn)`,
        });
        continue;
      }

      const affiliateShortLink = (cells[0] ?? '') === '' ? null : (cells[0] as string);
      const itemId = (cells[1] ?? '') === '' ? null : (cells[1] as string);
      const shopId = (cells[2] ?? '') === '' ? null : (cells[2] as string);
      const periodStart = cells[3] ?? '';
      const periodEnd = cells[4] ?? '';
      const orderCount = intNonNeg(cells[5] ?? '');
      const conversions = intNonNeg(cells[6] ?? '');
      const gmv = intNonNeg(cells[7] ?? '');
      const commission = intNonNeg(cells[8] ?? '');
      const orderRef = (cells[9] ?? '') === '' ? null : (cells[9] as string);

      const errors: string[] = [];
      if (!affiliateShortLink && !itemId)
        errors.push('cần affiliateShortLink hoặc itemId để attribute');
      // ISO date bắt buộc — '25/06/2026' hay format khác làm snapshotId mất
      // determinism + so sánh kỳ sai → reject thay vì nhận mơ hồ.
      if (!ISO_DATE_RE.test(periodStart)) errors.push('periodStart: cần dạng YYYY-MM-DD');
      if (!ISO_DATE_RE.test(periodEnd)) errors.push('periodEnd: cần dạng YYYY-MM-DD');
      if (orderCount === null) errors.push('orderCount: phải là số nguyên ≥ 0 (chỉ digit)');
      if (conversions === null) errors.push('conversions: phải là số nguyên ≥ 0 (chỉ digit)');
      if (gmv === null) errors.push('gmv: phải là số nguyên ≥ 0 (VND đồng, chỉ digit)');
      if (commission === null)
        errors.push('commission: phải là số nguyên ≥ 0 (VND đồng, chỉ digit)');
      if (orderCount !== null && conversions !== null && conversions > orderCount)
        errors.push(`conversions (${conversions}) > orderCount (${orderCount})`);
      if (gmv !== null && commission !== null && commission > gmv)
        errors.push(`commission (${commission}) > gmv (${gmv})`);
      if (ISO_DATE_RE.test(periodStart) && ISO_DATE_RE.test(periodEnd) && periodEnd < periodStart)
        errors.push('periodEnd trước periodStart');

      if (errors.length > 0) {
        rejected.push({ reason: `dòng ${dataLine}: ${errors.join('; ')}` });
        continue;
      }

      // Attribution — exact match, không đoán (No-Go #7).
      const matches = this.ctx.publishedPosts.filter(
        (p) =>
          (affiliateShortLink !== null && p.affiliateShortLink === affiliateShortLink) ||
          (itemId !== null && p.productId === itemId),
      );
      const uniqueJobIds = [...new Set(matches.map((p) => p.jobId))];

      let jobId: string | null = null;
      let ingestStatus: ShopeeIngestStatus = 'unattributed';
      let note: string | undefined;
      if (uniqueJobIds.length === 1) {
        jobId = uniqueJobIds[0] as string;
        ingestStatus = 'success';
      } else if (uniqueJobIds.length > 1) {
        ingestStatus = 'partial';
        note = `khớp nhiều job (${uniqueJobIds.join(', ')}) — không tự chọn, Operator phân bổ tay`;
      } else {
        note = 'không khớp bài đã đăng nào (shortLink/itemId)';
      }

      snapshots.push({
        snapshotId: deriveShopeeSnapshotId({
          jobId,
          periodStart,
          periodEnd,
          orderRef,
          affiliateShortLink,
          itemId,
        }),
        jobId,
        affiliateShortLink,
        shopId,
        itemId,
        periodStart,
        periodEnd,
        orderCount: orderCount as number,
        conversions: conversions as number,
        gmv: gmv as number,
        commission: commission as number,
        currency: 'VND',
        source: this.source,
        ingestStatus,
        ...(note ? { note } : {}),
      });
    }

    return Promise.resolve({ snapshots, rejected });
  }
}

/**
 * Stub khai báo cho connector API thật — KHÔNG implement round này (No-Go #2:
 * không gọi live API khi task chưa cho phép). Khi được GO riêng, implement
 * ingest() đọc report từ Shopee Affiliate Open API rồi map cùng shape.
 */
export class ShopeeAffiliateApiConnector implements ShopeeRevenueConnector {
  readonly source = 'shopee_affiliate_api' as const;

  ingest(_input: unknown): Promise<ShopeeIngestResult> {
    return Promise.resolve({
      snapshots: [],
      rejected: [{ reason: 'ShopeeAffiliateApiConnector chưa được kích hoạt (No-Go #2 — stub)' }],
    });
  }
}
