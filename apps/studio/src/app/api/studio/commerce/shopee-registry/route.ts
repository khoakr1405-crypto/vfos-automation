/* =============================================================================
 * VFOS Studio — Shopee Affiliate Registry read API (Studio Commerce UI 01)
 * -----------------------------------------------------------------------------
 * GET local-only. Reads production/_commerce/shopee_link_registry.json + the
 * current Product Card (data/temp/selected_product_card.json) and returns a
 * SANITIZED list. Never returns canonical_url (it can carry credential_token /
 * gads_t_sig), never returns cookie/session/secret. Read-only — no click, no
 * browser, no live extraction, no Shopee API.
 * ========================================================================== */

import { existsSync, readFileSync } from 'node:fs';
import { resolveInsideRepo } from '@/lib/studio-data/paths';

export const dynamic = 'force-dynamic';

const EXPECTED_OWNER = 'an_17376660568';
const VERIFIED_STATUS = 'VERIFIED_FROM_LONG_LINK';
const REGISTRY_REL = 'production/_commerce/shopee_link_registry.json';
const CARD_REL = 'data/temp/selected_product_card.json';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host);
}

interface RegistryEntry {
  product_name?: string;
  shopid?: string | null;
  itemid?: string | null;
  short_link?: string | null;
  affiliate_owner_id?: string | null;
  affiliate_link_status?: string | null;
  score?: number | string;
  criteria?: string;
  last_seen_at?: string;
  times_seen?: number;
}

interface RegistryItem {
  shortLink: string;
  productName: string;
  shopid: string;
  itemid: string;
  affiliateOwnerId: string;
  ownerVerified: boolean;
  status: string;
  score?: number;
  commissionRate?: string;
  price?: string;
  timesSeen?: number;
  lastSeenAt?: string;
}

interface CurrentCard {
  name: string;
  shopId: string;
  itemId: string;
  shortLink: string;
  affiliateOwnerId: string;
  score?: number;
  validationStatus?: string;
}

/** Best-effort extraction of commission% / price from the scoring criteria
 * string (e.g. "commission_high(80%), price_sweet(156750đ), …"). Never throws. */
function parseCriteria(criteria?: string): { commissionRate?: string; price?: string } {
  if (!criteria) return {};
  const out: { commissionRate?: string; price?: string } = {};
  const comm = criteria.match(/(\d+(?:\.\d+)?)\s*%/);
  if (comm) out.commissionRate = `${comm[1]}%`;
  const price = criteria.match(/price_\w+\((\d+)\s*đ\)/);
  if (price) {
    const n = Number.parseInt(price[1], 10);
    if (Number.isFinite(n)) out.price = `${n.toLocaleString('vi-VN')}đ`;
  }
  return out;
}

function readRegistry(): { items: RegistryItem[]; updatedAt: string | null } {
  const abs = resolveInsideRepo(REGISTRY_REL);
  if (!abs || !existsSync(abs)) return { items: [], updatedAt: null };
  try {
    const parsed = JSON.parse(readFileSync(abs, 'utf8')) as {
      entries?: RegistryEntry[];
      updated_at?: string;
    };
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    const items: RegistryItem[] = entries
      .filter((e) => e.short_link && e.shopid && e.itemid && e.product_name)
      .map((e) => {
        const ownerVerified =
          e.affiliate_owner_id === EXPECTED_OWNER && e.affiliate_link_status === VERIFIED_STATUS;
        const { commissionRate, price } = parseCriteria(e.criteria);
        return {
          shortLink: e.short_link as string,
          productName: e.product_name as string,
          shopid: String(e.shopid),
          itemid: String(e.itemid),
          affiliateOwnerId: e.affiliate_owner_id ?? '',
          ownerVerified,
          status: e.affiliate_link_status ?? 'UNKNOWN',
          ...(typeof e.score === 'number' ? { score: e.score } : {}),
          ...(commissionRate ? { commissionRate } : {}),
          ...(price ? { price } : {}),
          ...(typeof e.times_seen === 'number' ? { timesSeen: e.times_seen } : {}),
          ...(e.last_seen_at ? { lastSeenAt: e.last_seen_at } : {}),
        };
      });
    return { items, updatedAt: parsed.updated_at ?? null };
  } catch {
    return { items: [], updatedAt: null };
  }
}

function readCurrentCard(): CurrentCard | null {
  const abs = resolveInsideRepo(CARD_REL);
  if (!abs || !existsSync(abs)) return null;
  try {
    const c = JSON.parse(readFileSync(abs, 'utf8')) as Record<string, unknown>;
    // Sanitized projection — never echo canonicalUrl/canonicalCleanUrl.
    return {
      name: String(c.name ?? ''),
      shopId: String(c.shopId ?? ''),
      itemId: String(c.itemId ?? ''),
      shortLink: String(c.shortLink ?? ''),
      affiliateOwnerId: String(c.affiliateOwnerId ?? ''),
      ...(typeof c.score === 'number' ? { score: c.score } : {}),
      ...(typeof c.validationStatus === 'string' ? { validationStatus: c.validationStatus } : {}),
    };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, code: 'NOT_LOCAL', message: 'Chỉ cho phép đọc từ local dev.' },
      { status: 403 },
    );
  }

  const { items, updatedAt } = readRegistry();
  const currentCard = readCurrentCard();
  const verifiedCount = items.filter((i) => i.ownerVerified).length;
  const latest = [...items].sort((a, b) =>
    String(b.lastSeenAt ?? '').localeCompare(String(a.lastSeenAt ?? '')),
  )[0];

  return Response.json({
    ok: true,
    expectedOwner: EXPECTED_OWNER,
    total: items.length,
    verifiedCount,
    updatedAt,
    latestShortLink: latest?.shortLink ?? null,
    items,
    currentCard,
    checkedAt: new Date().toISOString(),
  });
}
