import { existsSync, createReadStream } from 'node:fs';
import { resolveInsideRepo } from '@/lib/studio-data/paths';
import { Readable } from 'node:stream';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ jobId: string; frameIndex: string }> }
) {
  const { jobId, frameIndex } = await ctx.params;

  // Validate parameters to prevent path traversal
  if (!/^[A-Za-z0-9_-]+$/.test(jobId) || !/^[1-5]$/.test(frameIndex)) {
    return new Response('Mã parameters không hợp lệ.', { status: 400 });
  }

  const relPath = `runs/${jobId}/source/frames/frame_${frameIndex}.jpg`;
  const absPath = resolveInsideRepo(relPath);

  if (!absPath || !existsSync(absPath)) {
    return new Response('Không tìm thấy frame hình ảnh.', { status: 404 });
  }

  try {
    const stream = createReadStream(absPath);
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err: any) {
    return new Response('Lỗi khi đọc file frame hình ảnh.', { status: 500 });
  }
}
