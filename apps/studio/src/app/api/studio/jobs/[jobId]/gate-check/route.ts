/* =============================================================================
 * GET /api/studio/jobs/:jobId/gate-check — PR-C, READ-ONLY diagnostic.
 * -----------------------------------------------------------------------------
 * Soi gate 1 job (Product Review job_* / Entertainment ent_*) qua shared
 * buildGateCheck (pure-read). KHÔNG mutate, KHÔNG POST/action, KHÔNG UI.
 * Khớp convention sibling route (không local-guard). Map lỗi:
 *   INVALID_JOB_ID / UNSUPPORTED_JOB_ID_PREFIX → 400 · JOB_NOT_FOUND → 404.
 * ========================================================================== */

import { buildGateCheck } from '@/lib/gate-check/build-gate-check';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  const result = buildGateCheck(jobId);
  if (result.ok) return Response.json(result);
  const status = result.code === 'JOB_NOT_FOUND' ? 404 : 400;
  return Response.json(result, { status });
}
