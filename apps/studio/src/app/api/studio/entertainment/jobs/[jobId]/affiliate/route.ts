/* =============================================================================
 * VFOS Studio — Entertainment AFFILIATE API (Content-Led)
 * -----------------------------------------------------------------------------
 * Gắn/gỡ sản phẩm Shopee vào ent_job ở khâu ĐÓNG GÓI (không phải intake).
 * GET  → block affiliate hiện tại của job (read-only).
 * POST { shortLink }        → attach: server TỰ tra registry, đòi owner VERIFIED,
 *                             snapshot Product Card sanitized vào job dir.
 * POST { action: 'detach' } → gỡ sản phẩm (affiliate = null).
 * An toàn: chỉ nhận short link s.shopee.vn (regex 2 lớp: route + lib); KHÔNG
 * canonical_url; KHÔNG đổi state/gate; KHÔNG auto-publish. Local-only.
 * Job I/O đi qua lib entertainment — KHÔNG đụng API/lib lane Review.
 * ========================================================================== */

import { existsSync, readFileSync } from 'node:fs';
import {
  attachJobAffiliate,
  detachJobAffiliate,
  isValidJobId,
  readManifest,
} from '@/lib/entertainment/jobs';
import { resolveInsideRepo } from '@/lib/studio-data/paths';

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host ?? '');
}

// Cùng chuẩn verify với commerce registry API (owner + status VERIFIED).
const EXPECTED_OWNER = 'an_17376660568';
const VERIFIED_STATUS = 'VERIFIED_FROM_LONG_LINK';
const REGISTRY_REL = 'production/_commerce/shopee_link_registry.json';
const SAFE_SHOPEE_SHORT_LINK = /^https:\/\/s\.shopee\.vn\/[A-Za-z0-9]+$/;

interface RegistryEntry {
  product_name?: string;
  shopid?: string | null;
  itemid?: string | null;
  short_link?: string | null;
  affiliate_owner_id?: string | null;
  affiliate_link_status?: string | null;
  criteria?: string;
  score?: number | string;
}

/** Tra 1 entry theo short_link trong registry (read-only, sanitized dùng nội bộ). */
function findRegistryEntry(shortLink: string): RegistryEntry | null {
  const abs = resolveInsideRepo(REGISTRY_REL);
  if (!abs || !existsSync(abs)) return null;
  try {
    const parsed = JSON.parse(readFileSync(abs, 'utf8')) as { entries?: RegistryEntry[] };
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    return entries.find((e) => e.short_link === shortLink) ?? null;
  } catch {
    return null;
  }
}

function parseCriteria(criteria?: string): { commissionRate?: string; price?: string } {
  if (!criteria) return {};
  const out: { commissionRate?: string; price?: string } = {};
  const comm = criteria.match(/(\d+(?:\.\d+)?)\s*%/);
  if (comm) out.commissionRate = `${comm[1]}%`;
  const price = criteria.match(/price_\w+\((\d+)\s*đ\)/);
  if (price) {
    const n = Number.parseInt(price[1] ?? '', 10);
    if (Number.isFinite(n)) out.price = `${n.toLocaleString('vi-VN')}đ`;
  }
  return out;
}

export async function GET(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  if (!isLocalRequest(req)) {
    return Response.json({ ok: false, code: 'NOT_LOCAL' }, { status: 403 });
  }
  const { jobId } = await ctx.params;
  if (!isValidJobId(jobId)) {
    return Response.json({ ok: false, code: 'BAD_JOB_ID' }, { status: 400 });
  }
  const job = readManifest(jobId);
  if (!job) {
    return Response.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
  }
  return Response.json({ ok: true, affiliate: job.affiliate ?? null });
}

export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  if (!isLocalRequest(req)) {
    return Response.json({ ok: false, code: 'NOT_LOCAL' }, { status: 403 });
  }
  const { jobId } = await ctx.params;
  if (!isValidJobId(jobId)) {
    return Response.json({ ok: false, code: 'BAD_JOB_ID' }, { status: 400 });
  }

  let body: { action?: string; shortLink?: string };
  try {
    body = (await req.json()) as { action?: string; shortLink?: string };
  } catch {
    return Response.json({ ok: false, code: 'BAD_BODY' }, { status: 400 });
  }

  if (body.action === 'detach') {
    const res = detachJobAffiliate(jobId);
    if (!res.ok) {
      return Response.json(res, { status: res.code === 'NOT_FOUND' ? 404 : 500 });
    }
    return Response.json({ ok: true, affiliate: null });
  }

  const shortLink = (body.shortLink ?? '').trim();
  if (!SAFE_SHOPEE_SHORT_LINK.test(shortLink)) {
    return Response.json(
      {
        ok: false,
        code: 'UNSAFE_LINK',
        message: 'Chỉ chấp nhận short link https://s.shopee.vn/... từ kho link.',
      },
      { status: 400 },
    );
  }
  const entry = findRegistryEntry(shortLink);
  if (!entry) {
    return Response.json(
      {
        ok: false,
        code: 'NOT_IN_REGISTRY',
        message: 'Link không có trong kho link đã trích xuất — chỉ gắn sản phẩm từ kho.',
      },
      { status: 404 },
    );
  }
  const ownerVerified =
    entry.affiliate_owner_id === EXPECTED_OWNER && entry.affiliate_link_status === VERIFIED_STATUS;
  if (!ownerVerified) {
    return Response.json(
      {
        ok: false,
        code: 'OWNER_NOT_VERIFIED',
        message: `Sản phẩm chưa VERIFIED đúng owner ${EXPECTED_OWNER} — không gắn để tránh mất hoa hồng.`,
      },
      { status: 409 },
    );
  }

  const { commissionRate, price } = parseCriteria(entry.criteria);
  const res = attachJobAffiliate(jobId, {
    shortLink,
    productName: entry.product_name ?? '(không tên)',
    affiliateOwnerId: entry.affiliate_owner_id ?? '',
    ownerVerified,
    ...(entry.shopid ? { shopid: String(entry.shopid) } : {}),
    ...(entry.itemid ? { itemid: String(entry.itemid) } : {}),
    ...(typeof entry.score === 'number' ? { score: entry.score } : {}),
    ...(commissionRate ? { commissionRate } : {}),
    ...(price ? { price } : {}),
  });
  if (!res.ok) {
    return Response.json(res, { status: res.code === 'NOT_FOUND' ? 404 : 400 });
  }
  return Response.json({ ok: true, affiliate: res.job.affiliate ?? null });
}
