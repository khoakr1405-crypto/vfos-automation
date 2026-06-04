import { resolveInsideRepo } from '@/lib/growth-data/paths';
import { generateWeeklyReport } from '@/lib/growth-data/weekly-report-generator';

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host);
}

export async function POST(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, code: 'NOT_LOCAL', message: 'Chỉ cho phép generate từ local dev.' },
      { status: 403 },
    );
  }

  let weekId: string | null = null;
  try {
    const body = await req.json();
    if (body && typeof body.weekId === 'string') {
      weekId = body.weekId;
    }
  } catch {
    // Gracefully fallback to default week if body parsing fails
  }

  try {
    const result = generateWeeklyReport({ weekId, dryRun: false });
    const runtimeTargetConfigured = !!resolveInsideRepo('data/growth/runtime');

    const generatedFiles = [];
    if (result.jsonFilePath) {
      generatedFiles.push(result.jsonFilePath.split(/[\\/]/).pop() || '');
    }
    if (result.markdownFilePath) {
      generatedFiles.push(result.markdownFilePath.split(/[\\/]/).pop() || '');
    }

    return Response.json({
      ok: true,
      reportId: result.reportId,
      weekId: result.weekId,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      generatedAt: result.generatedAt,
      dataConfidence: result.dataConfidence,
      kpi: result.kpi,
      decisionsCount: result.decisionsCount,
      actionPlanCount: result.actionPlanCount,
      runtimeTargetConfigured,
      generatedFiles,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, message: `Lỗi sinh báo cáo: ${errorMsg}` }, { status: 500 });
  }
}
