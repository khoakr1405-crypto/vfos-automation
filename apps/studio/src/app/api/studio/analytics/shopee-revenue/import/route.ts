/* =============================================================================
 * VFOS Studio — Guarded local import: Shopee revenue CSV (G1 — Slice 6, §5 spec)
 * -----------------------------------------------------------------------------
 * POST local-only. Operator paste CSV export từ Shopee Affiliate dashboard →
 * ManualCsvShopeeConnector (pure) parse/validate/attribute → append LOCAL RUNTIME
 * gitignored (data/growth/runtime/shopee-revenue-snapshots.json).
 * Guard (clone manual-performance/save): local-only 403; secret-scan payload;
 * validate server-side all-or-nothing; dedupe snapshotId idempotent.
 * KHÔNG gọi Shopee API (No-Go #2), KHÔNG log payload thô, KHÔNG trả path.
 * Attribution context CHỈ từ bài đã đăng THẬT (store G4 + derive) — fixture
 * không bao giờ tham gia attribute tiền (No-Go #6).
 * ========================================================================== */

import { derivePublishedPostFromArtifacts } from '@/lib/growth-data/attribution';
import { loadRealPublishedVideos } from '@/lib/growth-data/load';
import { findSensitiveTerms } from '@/lib/growth-data/manual-input';
import {
  appendShopeeRevenueSnapshots,
  readPublishedPostsStore,
} from '@/lib/growth-data/runtime-store';
import { ManualCsvShopeeConnector } from '@/lib/growth-data/shopee/connector';
import type { PublishedPost } from '@/lib/growth-data/types';

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Local-only guard — host header + Origin (nếu có) đều phải loopback. */
function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') || '').trim().toLowerCase();
  if (!host) return false;
  const hostname = host.startsWith('[')
    ? host.slice(0, host.indexOf(']') + 1)
    : (host.split(':')[0] ?? '');
  if (!LOCAL_HOSTS.has(hostname)) return false;
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      const oh = new URL(origin).hostname.toLowerCase();
      if (!LOCAL_HOSTS.has(oh)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** Context attribution server-side: store G4 + derive từ artifact job PUBLISHED
 * thật. Fixture rows KHÔNG bao giờ vào đây (source real only). */
function buildAttributionContext(): PublishedPost[] {
  const fromStore = readPublishedPostsStore().posts;
  const known = new Set(fromStore.map((p) => p.jobId));
  const { rows, source } = loadRealPublishedVideos();
  if (source !== 'real') return fromStore;
  const derived = rows
    .filter((r) => !known.has(r.jobId))
    .map((r) => derivePublishedPostFromArtifacts(r.jobId))
    .filter((p): p is PublishedPost => p !== null);
  return [...fromStore, ...derived];
}

export async function POST(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, code: 'NOT_LOCAL', message: 'Chỉ cho phép import từ local dev.' },
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
        message: 'Payload chứa trường nhạy cảm — từ chối import.',
        fields: sensitive,
      },
      { status: 400 },
    );
  }

  const csv = (body as { csv?: unknown })?.csv;
  if (typeof csv !== 'string' || csv.trim() === '') {
    return Response.json(
      { ok: false, code: 'EMPTY', message: 'Thiếu trường csv (text export Shopee).' },
      { status: 400 },
    );
  }

  const connector = new ManualCsvShopeeConnector({ publishedPosts: buildAttributionContext() });
  const { snapshots, rejected } = await connector.ingest(csv);

  // All-or-nothing như manual save: có dòng invalid → không ghi gì cả.
  if (rejected.length > 0) {
    return Response.json(
      {
        ok: false,
        code: 'INVALID_ROWS',
        message: 'Có dòng không hợp lệ — không import gì cả.',
        savedCount: 0,
        duplicateIds: [],
        rejected,
      },
      { status: 400 },
    );
  }
  if (snapshots.length === 0) {
    return Response.json(
      { ok: false, code: 'EMPTY', message: 'Không có dòng dữ liệu nào trong CSV.' },
      { status: 400 },
    );
  }

  const result = appendShopeeRevenueSnapshots(snapshots);
  if (!result.ok) {
    return Response.json(
      {
        ok: false,
        code: 'WRITE_FAILED',
        message: 'Không ghi được local runtime.',
        savedCount: 0,
        duplicateIds: result.duplicateIds,
      },
      { status: 500 },
    );
  }

  const attribution = {
    success: snapshots.filter((s) => s.ingestStatus === 'success').length,
    partial: snapshots.filter((s) => s.ingestStatus === 'partial').length,
    unattributed: snapshots.filter((s) => s.ingestStatus === 'unattributed').length,
  };

  return Response.json({
    ok: true,
    savedCount: result.savedCount,
    duplicateIds: result.duplicateIds,
    totalAfter: result.totalAfter,
    attribution,
    message:
      result.savedCount > 0
        ? `Đã import ${result.savedCount} dòng doanh thu Shopee (${attribution.success} attribute được job).`
        : 'Không có dòng mới (tất cả đều trùng snapshotId — re-import idempotent).',
  });
}
