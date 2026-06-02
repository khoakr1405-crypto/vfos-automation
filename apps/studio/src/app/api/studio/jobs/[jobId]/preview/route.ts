/* GET /api/studio/jobs/:jobId/preview — Round UI-02 read-only media stream.
 * Serve captioned preview mp4 của job qua URL an toàn (không expose raw local
 * path). Chống path traversal (jobId regex + resolveInsideRepo), hỗ trợ HTTP
 * Range để không tải toàn bộ video. KHÔNG side effect. */
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { getJobPreviewAbsPath } from '@/lib/studio-data/jobs';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) {
    return new Response('Bad job id', { status: 400 });
  }

  const file = getJobPreviewAbsPath(jobId);
  if (!file) return new Response('Preview not found', { status: 404 });

  let total: number;
  try {
    total = statSync(file).size;
  } catch {
    return new Response('Preview not found', { status: 404 });
  }

  const range = req.headers.get('range');
  const baseHeaders: Record<string, string> = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  };

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m?.[1] ? Number.parseInt(m[1], 10) : 0;
    let end = m?.[2] ? Number.parseInt(m[2], 10) : total - 1;
    if (!Number.isFinite(start) || start < 0) start = 0;
    if (!Number.isFinite(end) || end >= total) end = total - 1;
    if (start > end) {
      return new Response('Range not satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${total}` },
      });
    }
    const stream = createReadStream(file, { start, end });
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${total}`,
      },
    });
  }

  const stream = createReadStream(file);
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 200,
    headers: { ...baseHeaders, 'Content-Length': String(total) },
  });
}
