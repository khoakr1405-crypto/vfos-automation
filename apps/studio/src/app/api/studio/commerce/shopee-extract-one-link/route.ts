/* =============================================================================
 * VFOS Studio — Shopee live extraction endpoint (Studio Commerce UI 01)
 * -----------------------------------------------------------------------------
 * POST local-only. Spawns the CLI `pnpm shopee:extract-links-cdp --target-count=1`
 * using the safe repo-script runner runRepoScript (shell: false) to prevent injection.
 * Checks confirmPhrase === "GET 1 SHOPEE LINK".
 * Returns a sanitized result back to the frontend without any credentials/secrets.
 * ========================================================================== */

import { existsSync, readFileSync } from 'node:fs';
import { resolveInsideRepo } from '@/lib/studio-data/paths';
import { runRepoScript } from '@/lib/studio-data/run-command';

export const dynamic = 'force-dynamic';

const EXPECTED_OWNER = 'an_17376660568';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);
const CLI_REL = 'packages/shopee/scripts/extract-links-cdp.ts';
const REGISTRY_REL = 'production/_commerce/shopee_link_registry.json';

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host);
}

interface ExtractBody {
  confirmPhrase?: string;
}

export async function POST(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, code: 'NOT_LOCAL', message: 'Chỉ cho phép trích xuất từ local dev.' },
      { status: 403 },
    );
  }

  let body: ExtractBody;
  try {
    body = (await req.json()) as ExtractBody;
  } catch {
    body = {};
  }

  const confirmPhrase = body.confirmPhrase?.trim();
  if (!confirmPhrase) {
    return Response.json(
      { ok: false, code: 'MISSING_PHRASE', message: 'Thiếu confirmPhrase.' },
      { status: 400 },
    );
  }

  if (confirmPhrase !== 'GET 1 SHOPEE LINK') {
    return Response.json(
      {
        ok: false,
        code: 'BAD_PHRASE',
        message: 'confirmPhrase không khớp. Cần "GET 1 SHOPEE LINK".',
      },
      { status: 400 },
    );
  }

  // Execute the script using safe runner (no shell: true)
  const run = runRepoScript(CLI_REL, ['--target-count=1', '--max-clicks=5']);

  const stdout = run.stdout ?? '';
  const stderr = run.stderr ?? '';
  const combined = `${stdout}\n${stderr}`;

  // Parse status
  const statusMatch = combined.match(/status\s*:\s*(\w+)/);
  const status = (statusMatch?.[1] || 'FAIL') as 'SUCCESS' | 'SUSPENDED' | 'FAIL';

  // Parse reason
  const reasonMatch = combined.match(/reason\s*:\s*(.+)/);
  const reason = reasonMatch?.[1]?.trim() || '';

  // Parse shortLink
  const shortLinkMatch = combined.match(
    /short_link\s*:\s*(https:\/\/s\.shopee\.vn\/[A-Za-z0-9]+)/i,
  );
  const shortLink = shortLinkMatch?.[1] || undefined;

  // Parse canonical
  const canonicalMatch = combined.match(/canonical\s*:\s*(https?:\/\/[^\s]+)/i);
  const canonical = canonicalMatch?.[1] || undefined;

  // Parse IDs
  const idsMatch = combined.match(/ids\s*:\s*(\d+)\s*\/\s*(\d+)/);
  const shopid = idsMatch?.[1] || undefined;
  const itemid = idsMatch?.[2] || undefined;

  // Parse product name
  const productNameMatch = combined.match(/click "Lấy link"\s*—\s*(.+)/i);
  const productName = productNameMatch?.[1]?.trim() || undefined;

  // Parse upsert info
  const upsertMatch = combined.match(/upsert:\s*inserted=(\w+)\s*duplicate=(\w+)/i);
  const inserted = upsertMatch?.[1] === 'true';
  const duplicate = upsertMatch?.[2] === 'true';

  let ownerVerified = false;
  let productImageCaptured = false;

  // Query registry JSON if registry is written to get the most accurate and up-to-date info
  const registryAbs = resolveInsideRepo(REGISTRY_REL);
  if (registryAbs && existsSync(registryAbs)) {
    try {
      const registryData = JSON.parse(readFileSync(registryAbs, 'utf8'));
      if (registryData && Array.isArray(registryData.entries)) {
        interface FileRegistryEntry {
          short_link?: string | null;
          shopid?: string | number | null;
          itemid?: string | number | null;
          affiliate_owner_id?: string | null;
          affiliate_link_status?: string | null;
          product_image_url?: string | null;
        }
        const entry = (registryData.entries as FileRegistryEntry[]).find((e) => {
          if (shortLink && e.short_link === shortLink) return true;
          if (
            shopid &&
            itemid &&
            String(e.shopid) === String(shopid) &&
            String(e.itemid) === String(itemid)
          )
            return true;
          return false;
        });

        if (entry) {
          ownerVerified =
            entry.affiliate_owner_id === EXPECTED_OWNER &&
            entry.affiliate_link_status === 'VERIFIED_FROM_LONG_LINK';
          productImageCaptured = !!entry.product_image_url;
        }
      }
    } catch {}
  }

  const responsePayload = {
    ok: status === 'SUCCESS',
    status,
    message:
      reason ||
      (status === 'SUCCESS' ? 'Trích xuất link Shopee thành công.' : 'Trích xuất link thất bại.'),
    ...(shortLink ? { shortLink } : {}),
    ...(productName ? { productName } : {}),
    ...(shopid ? { shopid } : {}),
    ...(itemid ? { itemid } : {}),
    ownerVerified,
    expectedOwner: EXPECTED_OWNER,
    productImageCaptured,
    inserted,
    duplicate,
    checkedAt: new Date().toISOString(),
  };

  return Response.json(responsePayload);
}
