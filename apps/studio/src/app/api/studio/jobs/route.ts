/* GET /api/studio/jobs — Round UI-02 read-only. Danh sách job thật (DTO an toàn,
 * không path/URL/secret). KHÔNG side effect, không approve/reject, không publish. */
import { loadOperatorJobs } from '@/lib/studio-data/jobs';

export const dynamic = 'force-dynamic';

export function GET() {
  try {
    const jobs = loadOperatorJobs();
    return Response.json({
      source: 'real',
      generatedAt: new Date().toISOString(),
      count: jobs.length,
      jobs,
    });
  } catch {
    return Response.json(
      {
        source: 'real',
        generatedAt: new Date().toISOString(),
        count: 0,
        jobs: [],
        error: 'JOBS_READ_FAILED',
      },
      { status: 200 },
    );
  }
}
