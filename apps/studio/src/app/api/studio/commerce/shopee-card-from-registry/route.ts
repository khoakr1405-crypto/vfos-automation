/* =============================================================================
 * VFOS Studio — Promote Shopee registry link → Product Card (Studio Commerce 01)
 * -----------------------------------------------------------------------------
 * POST local-only. Reuses the audited CLI `pnpm shopee:card-from-registry`
 * (single source of truth) via a child process — NO click, NO browser, NO live
 * extraction, NO Shopee API. The CLI reads the registry, validates owner
 * (an_17376660568) + verified status, sanitises the canonical (strips
 * credential_token / gads_t_sig) and writes the link artifact + Product Card.
 * This route only forwards a strictly-validated selector and returns a
 * sanitized card summary (never canonical / credential).
 * ========================================================================== */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { repoRoot, resolveInsideRepo } from '@/lib/studio-data/paths';

export const dynamic = 'force-dynamic';

const EXPECTED_OWNER = 'an_17376660568';
const CARD_REL = 'data/temp/selected_product_card.json';
const CLI_REL = 'scripts/shopee-card-from-registry.ts';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

// Strict input shapes — defends against shell injection (we spawn with shell)
// AND ensures we only ever pass through clean selectors.
const SHORT_LINK_RE = /^https:\/\/s\.shopee\.vn\/[A-Za-z0-9]+$/;
const ITEMID_RE = /^\d{3,20}$/;

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host);
}

interface PromoteBody {
  shortLink?: string;
  itemid?: string;
  newest?: boolean;
}

/** Map raw CLI stderr to a clean, path-free operator message. */
function classifyFailure(stderr: string): string {
  const s = stderr.toLowerCase();
  if (s.includes('owner mismatch')) return 'Link không đúng affiliate owner — bị từ chối.';
  if (s.includes('not verified')) return 'Link chưa ở trạng thái verified — không thể promote.';
  if (s.includes('no registry entry matched')) return 'Không tìm thấy link trong registry.';
  if (s.includes('registry not found')) return 'Chưa có registry — hãy lấy link trước.';
  if (s.includes('missing required field')) return 'Entry registry thiếu trường bắt buộc.';
  if (s.includes('sensitive params')) return 'Canonical còn tham số nhạy cảm — đã chặn ghi.';
  return 'Promote thất bại. Kiểm tra registry và thử lại.';
}

export async function POST(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, code: 'NOT_LOCAL', message: 'Chỉ cho phép promote từ local dev.' },
      { status: 403 },
    );
  }

  let body: PromoteBody;
  try {
    body = (await req.json()) as PromoteBody;
  } catch {
    body = {};
  }

  const shortLink = body.shortLink?.trim();
  const itemid = body.itemid?.trim();
  const newest = body.newest === true;

  // Build the CLI selector with strict validation. Inputs are regex-validated
  // (no spaces/metacharacters) so they are safe to concatenate into the shell
  // command string below.
  const cmdParts: string[] = ['npx', 'tsx', CLI_REL];
  if (shortLink) {
    if (!SHORT_LINK_RE.test(shortLink)) {
      return Response.json(
        { ok: false, code: 'BAD_SHORT_LINK', message: 'Short link không hợp lệ.' },
        { status: 400 },
      );
    }
    cmdParts.push('--short-link', shortLink);
  } else if (itemid) {
    if (!ITEMID_RE.test(itemid)) {
      return Response.json(
        { ok: false, code: 'BAD_ITEMID', message: 'itemid không hợp lệ.' },
        { status: 400 },
      );
    }
    cmdParts.push('--itemid', itemid);
  } else if (newest) {
    cmdParts.push('--newest');
  } else {
    return Response.json(
      { ok: false, code: 'NO_SELECTOR', message: 'Cần shortLink, itemid hoặc newest.' },
      { status: 400 },
    );
  }

  // Reuse the audited CLI (single source of truth). No browser, no click.
  // Single command string (not an args array) to avoid Node's shell+args
  // deprecation; safe because every interpolated value is regex-validated.
  const run = spawnSync(cmdParts.join(' '), {
    cwd: repoRoot(),
    shell: true,
    encoding: 'utf8',
    timeout: 60_000,
  });

  if (run.status !== 0) {
    const stderr = `${run.stderr ?? ''}${run.stdout ?? ''}`;
    return Response.json(
      { ok: false, code: 'PROMOTE_FAILED', message: classifyFailure(stderr) },
      { status: 422 },
    );
  }

  // Read back the freshly-built Product Card (sanitized projection only).
  const cardAbs = resolveInsideRepo(CARD_REL);
  if (!cardAbs || !existsSync(cardAbs)) {
    return Response.json(
      { ok: false, code: 'CARD_NOT_WRITTEN', message: 'Không tìm thấy Product Card sau promote.' },
      { status: 500 },
    );
  }

  try {
    const c = JSON.parse(readFileSync(cardAbs, 'utf8')) as Record<string, unknown>;
    const ownerOk = String(c.affiliateOwnerId ?? '') === EXPECTED_OWNER;
    return Response.json({
      ok: true,
      ownerVerified: ownerOk,
      card: {
        name: String(c.name ?? ''),
        shopId: String(c.shopId ?? ''),
        itemId: String(c.itemId ?? ''),
        shortLink: String(c.shortLink ?? ''),
        affiliateOwnerId: String(c.affiliateOwnerId ?? ''),
        ...(typeof c.score === 'number' ? { score: c.score } : {}),
        ...(typeof c.validationStatus === 'string' ? { validationStatus: c.validationStatus } : {}),
      },
      checkedAt: new Date().toISOString(),
    });
  } catch {
    return Response.json(
      { ok: false, code: 'CARD_PARSE_ERROR', message: 'Không đọc được Product Card.' },
      { status: 500 },
    );
  }
}
