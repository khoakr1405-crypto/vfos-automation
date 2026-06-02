/* GET /api/studio/jobs/:jobId — Round UI-02 read-only. 1 job DTO an toàn. */
import { loadJobById } from '@/lib/studio-data/jobs';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) {
    return Response.json({ error: 'BAD_JOB_ID' }, { status: 400 });
  }
  try {
    const job = loadJobById(jobId);
    if (!job) return Response.json({ error: 'JOB_NOT_FOUND' }, { status: 404 });
    return Response.json({ source: 'real', job });
  } catch {
    return Response.json({ error: 'JOB_READ_FAILED' }, { status: 200 });
  }
}
