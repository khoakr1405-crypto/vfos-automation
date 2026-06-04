/* =============================================================================
 * VFOS Studio — Manual performance input parser/validator (Round Real Analytics 02A)
 * -----------------------------------------------------------------------------
 * PURE logic, CLIENT-SAFE. Type-only imports (KHÔNG node:fs) → dùng được cả ở
 * client component (preview) lẫn server (02B sau). KHÔNG ghi file, KHÔNG gọi API.
 * Parse CSV text Operator paste → draft rows + validate + warning. KHÔNG persist.
 *
 * CSV cột (theo thứ tự, header optional):
 *   jobId,publishedPostId,measuredAt,views,clicks,comments,reactions,shares,
 *   conversions,ctaRole,source
 * - publishedPostId/ctaRole/source optional. source mặc định 'manual_import'.
 * ========================================================================== */

import type { LinkRole, ManualMetricSource } from './types';

const LINK_ROLES = new Set<string>(['HUB_NATIVE', 'CAPTION_LINK', 'PINNED_COMMENT', 'REPLY_LINK']);
const SOURCES = new Set<string>(['fixture', 'manual', 'manual_import', 'api_future']);

/** Cột CSV theo thứ tự — dùng để hiển thị format + parse. */
export const MANUAL_CSV_COLUMNS = [
  'jobId',
  'publishedPostId',
  'measuredAt',
  'views',
  'clicks',
  'comments',
  'reactions',
  'shares',
  'conversions',
  'ctaRole',
  'source',
] as const;

/** Một dòng số liệu Operator nhập/paste — TRƯỚC khi thành ManualPerformanceSnapshot (chưa có snapshotId). */
export interface ManualInputDraft {
  jobId: string;
  publishedPostId: string | null;
  measuredAt: string;
  views: number;
  clicks: number;
  comments: number;
  reactions: number;
  shares: number;
  conversions: number;
  ctaRole: LinkRole | null;
  source: ManualMetricSource;
}

export interface ManualDraftRow {
  /** Số thứ tự dòng dữ liệu (1-based, không tính header/blank). */
  line: number;
  raw: string;
  draft: ManualInputDraft;
  /** Lỗi chặn — row invalid khi errors.length > 0. */
  errors: string[];
  /** Cảnh báo không chặn (vd jobId chưa khớp dữ liệu hiện có). */
  warnings: string[];
}

export interface ManualCsvParseResult {
  rows: ManualDraftRow[];
  validCount: number;
  invalidCount: number;
  warningCount: number;
  /** Tổng chỉ tính các row hợp lệ (errors rỗng). */
  totals: { views: number; clicks: number; conversions: number };
}

export interface ManualInputContext {
  knownJobIds: readonly string[];
  knownPostIds: readonly string[];
}

function isHeaderLine(line: string): boolean {
  const low = line.toLowerCase();
  return low.includes('jobid') && low.includes('views');
}

function parseRow(line: number, raw: string, ctx: ManualInputContext): ManualDraftRow {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cells = raw.split(',').map((c) => c.trim());

  // num(): parse 1 ô số nguyên ≥0; ghi lỗi nếu thiếu/không phải số/âm/không nguyên.
  const num = (raw1: string, field: string): number => {
    if (raw1 === '') {
      errors.push(`${field}: thiếu giá trị`);
      return 0;
    }
    const n = Number(raw1);
    if (!Number.isFinite(n)) {
      errors.push(`${field}: "${raw1}" không phải số`);
      return 0;
    }
    if (!Number.isInteger(n)) {
      errors.push(`${field}: phải là số nguyên`);
      return Math.trunc(n);
    }
    if (n < 0) errors.push(`${field}: không được âm`);
    return n;
  };

  const jobId = cells[0] ?? '';
  const publishedPostId = (cells[1] ?? '') === '' ? null : (cells[1] as string);
  const measuredAt = cells[2] ?? '';
  const views = num(cells[3] ?? '', 'views');
  const clicks = num(cells[4] ?? '', 'clicks');
  const comments = num(cells[5] ?? '', 'comments');
  const reactions = num(cells[6] ?? '', 'reactions');
  const shares = num(cells[7] ?? '', 'shares');
  const conversions = num(cells[8] ?? '', 'conversions');

  const ctaRoleRaw = (cells[9] ?? '').toUpperCase();
  const ctaRole = ctaRoleRaw === '' ? null : (ctaRoleRaw as LinkRole);
  const sourceRaw = (cells[10] ?? '') === '' ? 'manual_import' : (cells[10] as string);
  const source = sourceRaw as ManualMetricSource;

  if (cells.length < 9) errors.push(`Cần tối thiểu 9 cột (đang có ${cells.length})`);
  if (jobId === '') errors.push('jobId: thiếu giá trị');
  if (measuredAt === '') errors.push('measuredAt: thiếu giá trị');
  if (ctaRole !== null && !LINK_ROLES.has(ctaRole))
    errors.push(`ctaRole "${ctaRoleRaw}" không hợp lệ`);
  if (!SOURCES.has(source)) errors.push(`source "${sourceRaw}" không hợp lệ`);
  if (views > 0 && clicks > views) errors.push(`clicks (${clicks}) > views (${views})`);
  if (clicks > 0 && conversions > clicks)
    errors.push(`conversions (${conversions}) > clicks (${clicks})`);

  if (jobId !== '' && !ctx.knownJobIds.includes(jobId))
    warnings.push('jobId chưa khớp dữ liệu hiện có — cần map khi lưu thật (02B)');
  if (publishedPostId !== null && !ctx.knownPostIds.includes(publishedPostId))
    warnings.push(`publishedPostId "${publishedPostId}" chưa khớp post hiện có`);

  return {
    line,
    raw,
    draft: {
      jobId,
      publishedPostId,
      measuredAt,
      views,
      clicks,
      comments,
      reactions,
      shares,
      conversions,
      ctaRole,
      source,
    },
    errors,
    warnings,
  };
}

/** Parse + validate CSV text. PURE — không ghi gì, chỉ trả preview result. */
export function parseManualCsv(text: string, ctx: ManualInputContext): ManualCsvParseResult {
  const rows: ManualDraftRow[] = [];
  let dataLine = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    if (isHeaderLine(trimmed)) continue;
    dataLine += 1;
    rows.push(parseRow(dataLine, trimmed, ctx));
  }

  const valid = rows.filter((r) => r.errors.length === 0);
  const totals = valid.reduce(
    (acc, r) => ({
      views: acc.views + r.draft.views,
      clicks: acc.clicks + r.draft.clicks,
      conversions: acc.conversions + r.draft.conversions,
    }),
    { views: 0, clicks: 0, conversions: 0 },
  );

  return {
    rows,
    validCount: valid.length,
    invalidCount: rows.length - valid.length,
    warningCount: rows.filter((r) => r.warnings.length > 0).length,
    totals,
  };
}
