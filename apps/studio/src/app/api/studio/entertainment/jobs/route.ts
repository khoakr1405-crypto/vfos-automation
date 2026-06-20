/* =============================================================================
 * VFOS Studio — Entertainment lane jobs API (E-UI-2)
 * -----------------------------------------------------------------------------
 * POST: tạo job giải trí + intake (tải source qua 01-fetch-source, runRepoScript
 *       shell:false). GET: liệt kê job giải trí từ manifest.
 * Local-only. Sanitized. Namespace riêng /api/studio/entertainment — KHÔNG đụng
 * jobs/[jobId] (Product Review), không ghi registry Review/Shopee/publish.
 * ========================================================================== */

import { createJob, isValidNiche, listJobs } from '@/lib/entertainment/jobs';

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host ?? '');
}

interface CreateBody {
  url?: string;
  niche?: string;
}

export async function GET(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json({ ok: false, code: 'NOT_LOCAL' }, { status: 403 });
  }
  return Response.json({ ok: true, jobs: listJobs() });
}

export async function POST(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, code: 'NOT_LOCAL', message: 'Chỉ chạy từ local.' },
      { status: 403 },
    );
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    body = {};
  }

  const url = body.url?.trim();
  const niche = (body.niche ?? 'fishing-vlog').trim();

  if (!url || !/^https?:\/\/\S+$/i.test(url)) {
    return Response.json(
      { ok: false, code: 'BAD_URL', message: 'URL không hợp lệ (cần http/https).' },
      { status: 400 },
    );
  }
  if (!isValidNiche(niche)) {
    return Response.json(
      { ok: false, code: 'BAD_NICHE', message: 'Niche không hợp lệ.' },
      { status: 400 },
    );
  }

  try {
    const job = createJob({ url, niche });
    const ok = job.state === 'INTAKE_DONE';
    return Response.json({ ok, job }, { status: ok ? 200 : 502 });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        code: 'CREATE_FAILED',
        message: e instanceof Error ? e.message : 'Tạo job lỗi.',
      },
      { status: 500 },
    );
  }
}
