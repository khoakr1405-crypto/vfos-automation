/* =============================================================================
 * VFOS Studio — Guarded local save: manual performance snapshots (Real Analytics 02B)
 * -----------------------------------------------------------------------------
 * POST local-only. Lưu các dòng Operator đã preview vào LOCAL RUNTIME gitignored.
 * Guard: chỉ localhost; secret scan payload; validate server-side (không tin client);
 * reject nếu có invalid row; dedupe theo snapshotId. KHÔNG gọi API ngoài, KHÔNG
 * publish, KHÔNG log payload thô, KHÔNG trả path tuyệt đối.
 * ========================================================================== */

import {
  type ManualInputDraft,
  deriveSnapshotId,
  findSensitiveTerms,
  validateSavableDraft,
} from '@/lib/growth-data/manual-input';
import {
  type StoredSnapshot,
  appendSnapshots,
  runtimePathConfigured,
} from '@/lib/growth-data/runtime-store';
import type { LinkRole, ManualMetricSource } from '@/lib/growth-data/types';

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

/** Chỉ cho phép request từ local dev (host header). Chặn dùng từ xa. */
function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host);
}

/** Coerce raw object → ManualInputDraft (server không tin client). Số sai → NaN (validate bắt). */
function coerceDraft(raw: unknown): ManualInputDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const num = (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : Number.NaN;
  const ctaRole = str(o.ctaRole);
  const postId = o.publishedPostId;
  return {
    jobId: str(o.jobId),
    publishedPostId: postId === null || postId === undefined || postId === '' ? null : str(postId),
    measuredAt: str(o.measuredAt),
    views: num(o.views),
    clicks: num(o.clicks),
    comments: num(o.comments),
    reactions: num(o.reactions),
    shares: num(o.shares),
    conversions: num(o.conversions),
    ctaRole: ctaRole === '' ? null : (ctaRole as LinkRole),
    source: str(o.source) as ManualMetricSource,
  };
}

export async function POST(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, code: 'NOT_LOCAL', message: 'Chỉ cho phép lưu từ local dev.' },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { ok: false, code: 'BAD_JSON', message: 'Payload không phải JSON hợp lệ.' },
      { status: 400 },
    );
  }

  // Secret scan TRƯỚC khi xử lý — KHÔNG log payload thô.
  const sensitive = findSensitiveTerms(JSON.stringify(body ?? ''));
  if (sensitive.length > 0) {
    return Response.json(
      {
        ok: false,
        code: 'SENSITIVE_REJECTED',
        message: 'Payload chứa trường nhạy cảm — từ chối lưu.',
        fields: sensitive,
      },
      { status: 400 },
    );
  }

  const rows = (body as { rows?: unknown })?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return Response.json(
      { ok: false, code: 'EMPTY', message: 'Không có dòng nào để lưu.' },
      { status: 400 },
    );
  }

  const invalidRows: Array<{ index: number; errors: string[] }> = [];
  const valid: StoredSnapshot[] = [];
  const savedAt = new Date().toISOString();

  rows.forEach((raw, index) => {
    const draft = coerceDraft(raw);
    if (!draft) {
      invalidRows.push({ index, errors: ['Sai cấu trúc dòng'] });
      return;
    }
    const errors = validateSavableDraft(draft);
    if (errors.length > 0) {
      invalidRows.push({ index, errors });
      return;
    }
    valid.push({
      snapshotId: deriveSnapshotId(draft),
      jobId: draft.jobId,
      publishedPostId: draft.publishedPostId,
      facebookPostId: null,
      channelId: null,
      platform: 'facebook',
      measuredAt: draft.measuredAt,
      views: draft.views,
      clicks: draft.clicks,
      comments: draft.comments,
      reactions: draft.reactions,
      shares: draft.shares,
      conversions: draft.conversions,
      ctaRole: draft.ctaRole,
      source: draft.source,
      savedAt,
    });
  });

  // Reject ALL nếu có bất kỳ invalid row (không ghi 1 phần).
  if (invalidRows.length > 0) {
    return Response.json(
      {
        ok: false,
        code: 'INVALID_ROWS',
        message: 'Có dòng không hợp lệ — không lưu gì cả.',
        savedCount: 0,
        duplicateIds: [],
        invalidRows,
        runtimePathConfigured: runtimePathConfigured(),
      },
      { status: 400 },
    );
  }

  const result = appendSnapshots(valid);
  if (!result.ok) {
    return Response.json(
      {
        ok: false,
        code: 'WRITE_FAILED',
        message: 'Không ghi được local runtime.',
        savedCount: 0,
        duplicateIds: result.duplicateIds,
        invalidRows: [],
        runtimePathConfigured: runtimePathConfigured(),
      },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    savedCount: result.savedCount,
    duplicateIds: result.duplicateIds,
    invalidRows: [],
    runtimePathConfigured: true,
    message:
      result.savedCount > 0
        ? `Đã lưu ${result.savedCount} dòng vào local runtime.`
        : 'Không có dòng mới (tất cả đều trùng snapshotId).',
  });
}
