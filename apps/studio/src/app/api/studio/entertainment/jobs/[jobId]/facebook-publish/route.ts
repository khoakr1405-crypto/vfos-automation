/* =============================================================================
 * VFOS Studio — Entertainment lane → Facebook publish API
 * -----------------------------------------------------------------------------
 * POST: đăng video đã duyệt lên Facebook Reels. Guard đầy đủ qua facebook-
 * publish.ts (pure/DI); deps thật từ jobs.ts. Local-only. KHÔNG auto-publish:
 * Operator bấm nút. KHÔNG log/return token. Mặc định MOCK (META_MODE ≠ live) —
 * live cần META_MODE=live + VFOS_STUDIO_ALLOW_LIVE_PUBLISH=true + credential.
 * Contextual affiliate link/CTA nhận từ body (tuỳ chọn), owner CHỈ cảnh báo mềm.
 * ========================================================================== */

import { buildFacebookPublishDeps, isValidJobId } from '@/lib/entertainment/jobs';
import { type FacebookPublishErrorCode, publishToFacebook } from '@/lib/entertainment/facebook-publish';

export const dynamic = 'force-dynamic';
// Reel upload + processing poll có thể vượt 240s ở live.
export const maxDuration = 600;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host ?? '');
}

const HTTP_FOR: Record<FacebookPublishErrorCode, number> = {
  NOT_FOUND: 404,
  NO_PREVIEW_GATE: 409,
  NO_FINAL: 409,
  NO_CAPTION: 409,
  ALREADY_POSTED: 409,
  PUBLISH_BUSY: 409,
  BUSY: 409,
  FACEBOOK_DISABLED: 409,
  FACEBOOK_NOT_CONFIGURED: 409,
  LIVE_NOT_ENABLED: 409,
  FACEBOOK_API_ERROR: 502,
};

export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  if (!isLocalRequest(req)) {
    return Response.json({ ok: false, code: 'NOT_LOCAL' }, { status: 403 });
  }
  const { jobId } = await ctx.params;
  if (!isValidJobId(jobId)) {
    return Response.json({ ok: false, code: 'BAD_JOB_ID' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    caption?: unknown;
    affiliateLink?: unknown;
    contextualCta?: unknown;
    confirmRepost?: unknown;
  };
  const caption = typeof body.caption === 'string' ? body.caption : undefined;
  const affiliateLink = typeof body.affiliateLink === 'string' ? body.affiliateLink : undefined;
  const contextualCta = typeof body.contextualCta === 'string' ? body.contextualCta : undefined;
  const confirmRepost = body.confirmRepost === true;

  const res = await publishToFacebook(buildFacebookPublishDeps(), jobId, {
    caption,
    affiliateLink,
    contextualCta,
    confirmRepost,
  });
  if (!res.ok) {
    return Response.json(res, { status: HTTP_FOR[res.code] ?? 400 });
  }
  return Response.json(res, { status: 200 });
}
