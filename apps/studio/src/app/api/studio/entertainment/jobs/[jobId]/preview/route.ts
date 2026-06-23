/* =============================================================================
 * VFOS Studio — Entertainment preview stream API (E-UI-4)
 * -----------------------------------------------------------------------------
 * GET: stream file preview (montage_v2_short[_ambient].mp4) cho <video>. Hỗ trợ
 * HTTP Range (206) để seek. Local-only, jobId validated, path resolveInsideRepo.
 * Chỉ phục vụ file mp4 trong work dir của job — không leak path/secrets.
 * ========================================================================== */

import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { isValidJobId, previewVideoPath } from '@/lib/entertainment/jobs';

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host ?? '');
}

function toWeb(stream: NodeJS.ReadableStream): ReadableStream {
  return Readable.toWeb(stream as Readable) as unknown as ReadableStream;
}

export async function GET(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  if (!isLocalRequest(req)) {
    return Response.json({ ok: false, code: 'NOT_LOCAL' }, { status: 403 });
  }
  const { jobId } = await ctx.params;
  if (!isValidJobId(jobId)) {
    return Response.json({ ok: false, code: 'BAD_JOB_ID' }, { status: 400 });
  }
  const path = previewVideoPath(jobId);
  if (!path) {
    return Response.json({ ok: false, code: 'NO_PREVIEW' }, { status: 404 });
  }

  const size = statSync(path).size;
  const range = req.headers.get('range');

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m?.[1] ? Number(m[1]) : 0;
    const end = m?.[2] ? Number(m[2]) : size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= size) {
      return new Response(null, {
        status: 416,
        headers: { 'content-range': `bytes */${size}` },
      });
    }
    const stream = createReadStream(path, { start, end });
    return new Response(toWeb(stream), {
      status: 206,
      headers: {
        'content-type': 'video/mp4',
        'content-length': String(end - start + 1),
        'content-range': `bytes ${start}-${end}/${size}`,
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
      },
    });
  }

  const stream = createReadStream(path);
  return new Response(toWeb(stream), {
    status: 200,
    headers: {
      'content-type': 'video/mp4',
      'content-length': String(size),
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
    },
  });
}
