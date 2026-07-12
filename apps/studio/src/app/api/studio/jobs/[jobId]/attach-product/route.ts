/* =============================================================================
 * VFOS Studio — Attach Product Card to a video-first job (Trend Scout POV)
 * -----------------------------------------------------------------------------
 * POST (body rỗng) → gắn Product Card HIỆN TẠI (data/temp/selected_product_card
 * .json — do Operator promote từ kho link bằng máy móc audit sẵn có) vào job
 * WAITING_FOR_PRODUCT, qua CLI `pnpm job:attach-product` (single writer).
 * Gate server-side: card phải tồn tại + đúng owner + VERIFIED. Local-only.
 * ========================================================================== */

import { existsSync, readFileSync } from 'node:fs';
import { resolveInsideRepo } from '@/lib/studio-data/paths';
import { runRepoScript } from '@/lib/studio-data/run-command';

export const dynamic = 'force-dynamic';

const CARD_REL = 'data/temp/selected_product_card.json';
const EXPECTED_OWNER = 'an_17376660568';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host ?? '');
}

export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  if (!isLocalRequest(req)) {
    return Response.json({ ok: false, code: 'NOT_LOCAL' }, { status: 403 });
  }
  const { jobId } = await ctx.params;
  if (!/^job_\d{8}_\d{3}$/.test(jobId)) {
    return Response.json({ ok: false, code: 'BAD_JOB_ID' }, { status: 400 });
  }

  const cardAbs = resolveInsideRepo(CARD_REL);
  if (!cardAbs || !existsSync(cardAbs)) {
    return Response.json(
      {
        ok: false,
        code: 'MISSING_PRODUCT_CARD',
        message: 'Chưa có Product Card hiện tại — chọn sản phẩm từ kho link trước.',
      },
      { status: 409 },
    );
  }
  let card: { name?: unknown; affiliateOwnerId?: unknown; validationStatus?: unknown };
  try {
    card = JSON.parse(readFileSync(cardAbs, 'utf8')) as typeof card;
  } catch {
    return Response.json({ ok: false, code: 'INVALID_PRODUCT_CARD' }, { status: 500 });
  }
  if (card.affiliateOwnerId !== EXPECTED_OWNER || card.validationStatus !== 'VERIFIED') {
    return Response.json(
      {
        ok: false,
        code: 'OWNER_NOT_VERIFIED',
        message: `Product Card chưa VERIFIED đúng owner ${EXPECTED_OWNER} — không gắn.`,
      },
      { status: 409 },
    );
  }

  const spawnRes = runRepoScript('scripts/vfos-job-manager.ts', [
    'attach-product',
    '--job',
    jobId,
    '--from-product',
    CARD_REL,
  ]);
  if (spawnRes.status !== 0) {
    const stderr = (spawnRes.stderr ?? '') + (spawnRes.stdout ?? '');
    const code = /PRODUCT_ALREADY_ATTACHED/.test(stderr)
      ? 'PRODUCT_ALREADY_ATTACHED'
      : /UNKNOWN_JOB/.test(stderr)
        ? 'UNKNOWN_JOB'
        : 'SCRIPT_EXEC_FAILED';
    return Response.json(
      { ok: false, code, message: stderr.slice(-300) },
      { status: code === 'UNKNOWN_JOB' ? 404 : code === 'PRODUCT_ALREADY_ATTACHED' ? 409 : 500 },
    );
  }

  return Response.json({
    ok: true,
    jobId,
    productName: typeof card.name === 'string' ? card.name : null,
    state: 'WAITING_FOR_SOURCE_VIDEO',
  });
}
