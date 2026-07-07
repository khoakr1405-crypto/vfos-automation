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

/** snapshotId deterministic theo NỘI DUNG — re-import cùng dòng ⇒ cùng id ⇒ dedupe. */
export function deriveShopeeSnapshotId(d: {
  jobId: string | null;
  periodEnd: string;
  orderRef: string | null;
  affiliateShortLink: string | null;
  itemId: string | null;
}): string {
  const anchor = d.jobId ?? 'unattributed';
  const ref = d.orderRef ?? d.itemId ?? d.affiliateShortLink ?? 'norow';
  return `srs_${slug(anchor)}__${slug(d.periodEnd)}__${slug(ref)}`;
}

function isHeaderLine(line: string): boolean {
  const low = line.toLowerCase();
  return low.includes('affiliateshortlink') || (low.includes('gmv') && low.includes('commission'));
}

/** Parse 1 ô tiền/đếm: số NGUYÊN ≥ 0 (VND đồng). Sai → null (caller reject). */
function intNonNeg(raw: string): number | null {
  if (raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
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
    for (const rawLine of input.split(/\r?\n/)) {
      const trimmed = rawLine.trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;
      if (isHeaderLine(trimmed)) continue;
      dataLine += 1;

      const cells = trimmed.split(',').map((c) => c.trim());
      if (cells.length < 9) {
        rejected.push({ reason: `dòng ${dataLine}: cần tối thiểu 9 cột (đang có ${cells.length})` });
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
      if (periodStart === '') errors.push('periodStart: thiếu');
      if (periodEnd === '') errors.push('periodEnd: thiếu');
      if (orderCount === null) errors.push('orderCount: phải là số nguyên ≥ 0');
      if (conversions === null) errors.push('conversions: phải là số nguyên ≥ 0');
      if (gmv === null) errors.push('gmv: phải là số nguyên ≥ 0 (VND đồng)');
      if (commission === null) errors.push('commission: phải là số nguyên ≥ 0 (VND đồng)');
      if (orderCount !== null && conversions !== null && conversions > orderCount)
        errors.push(`conversions (${conversions}) > orderCount (${orderCount})`);
      if (gmv !== null && commission !== null && commission > gmv)
        errors.push(`commission (${commission}) > gmv (${gmv})`);
      const startMs = Date.parse(periodStart);
      const endMs = Date.parse(periodEnd);
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs < startMs)
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
        snapshotId: deriveShopeeSnapshotId({ jobId, periodEnd, orderRef, affiliateShortLink, itemId }),
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
