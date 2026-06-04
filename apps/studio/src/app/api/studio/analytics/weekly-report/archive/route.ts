import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveInsideRepo } from '@/lib/growth-data/paths';

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host);
}

export async function GET(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, code: 'NOT_LOCAL', message: 'Chỉ cho phép truy cập từ local dev.' },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const weekIdParam = url.searchParams.get('weekId');

  const reportDir = resolveInsideRepo(join('data', 'growth', 'runtime', 'reports', 'weekly'));
  if (!reportDir) {
    return Response.json(
      { ok: false, message: 'Không xác định được thư mục báo cáo.' },
      { status: 500 },
    );
  }

  // Chế độ đọc nội dung chi tiết Markdown của một tuần cụ thể
  if (weekIdParam) {
    if (!/^\d{4}-W\d{2}$/.test(weekIdParam)) {
      return Response.json(
        { ok: false, message: 'Định dạng mã tuần không hợp lệ. Kì vọng YYYY-WNN' },
        { status: 400 },
      );
    }

    const mdPath = join(reportDir, `${weekIdParam}.md`);
    if (!existsSync(mdPath)) {
      return Response.json({ ok: false, message: 'Báo cáo không tồn tại.' }, { status: 404 });
    }

    try {
      const content = readFileSync(mdPath, 'utf8');
      return Response.json({ ok: true, content });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json({ ok: false, message: `Lỗi đọc file: ${msg}` }, { status: 500 });
    }
  }

  // Chế độ liệt kê Archive
  if (!existsSync(reportDir)) {
    return Response.json([]);
  }

  try {
    const files = readdirSync(reportDir);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));

    const archives = [];

    for (const file of jsonFiles) {
      const weekId = file.replace('.json', '');
      if (!/^\d{4}-W\d{2}$/.test(weekId)) {
        continue;
      }

      const jsonPath = join(reportDir, file);
      const mdPath = join(reportDir, `${weekId}.md`);

      let generatedAt: string | null = null;
      let dataConfidence: string | null = null;
      let summary: {
        views: number;
        clicks: number;
        ctr: number;
        conversions: number;
        decisionCount: number;
        actionPlanCount: number;
      } | null = null;

      try {
        const raw = readFileSync(jsonPath, 'utf8');
        const parsed = JSON.parse(raw);
        generatedAt = parsed.generatedAt || null;
        dataConfidence = parsed.dataConfidence || null;
        if (parsed.kpi) {
          summary = {
            views: parsed.kpi.views ?? 0,
            clicks: parsed.kpi.clicks ?? 0,
            ctr: parsed.kpi.ctr ?? 0,
            conversions: parsed.kpi.conversions ?? 0,
            decisionCount: parsed.decisions ? parsed.decisions.length : 0,
            actionPlanCount: parsed.actionPlan ? parsed.actionPlan.length : 0,
          };
        }
      } catch {
        // Bỏ qua lỗi đọc JSON lỗi
      }

      archives.push({
        weekId,
        jsonAvailable: true,
        markdownAvailable: existsSync(mdPath),
        generatedAt,
        dataConfidence,
        summary,
      });
    }

    // Sắp xếp báo cáo mới nhất lên đầu
    archives.sort((a, b) => b.weekId.localeCompare(a.weekId));

    return Response.json(archives);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, message: `Lỗi đọc thư mục: ${msg}` }, { status: 500 });
  }
}
