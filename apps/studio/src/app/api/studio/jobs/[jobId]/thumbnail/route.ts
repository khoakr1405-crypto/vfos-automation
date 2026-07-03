/* =============================================================================
 * VFOS Studio — Job thumbnail (READ-ONLY, image stream)
 * -----------------------------------------------------------------------------
 * Stream 1 khung hình đại diện cho video của job (vision_frames/frame_001.jpg,
 * fallback frame_002…). Dùng làm thumbnail per-video ở Analytics. KHÔNG lộ local
 * path ra client (chỉ trả bytes ảnh); jobId validate chống path traversal; thiếu
 * frame → 404 để UI render placeholder. Đây là FRAME NGUỒN, không phải cover FB.
 * ========================================================================== */

import { createReadStream, existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { resolveInsideRepo } from '@/lib/studio-data/paths';

export const dynamic = 'force-dynamic';

// Thử vài frame đầu — frame_001 là mặc định, fallback nếu job thiếu frame đầu.
const FRAME_CANDIDATES = ['frame_001.jpg', 'frame_002.jpg', 'frame_003.jpg'];

export async function GET(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;

  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) {
    return new Response('Mã job không hợp lệ.', { status: 400 });
  }

  let absPath: string | null = null;
  for (const frame of FRAME_CANDIDATES) {
    const candidate = resolveInsideRepo(`data/temp/jobs/${jobId}/vision_frames/${frame}`);
    if (candidate && existsSync(candidate)) {
      absPath = candidate;
      break;
    }
  }

  if (!absPath) {
    return new Response('Không tìm thấy thumbnail cho job này.', { status: 404 });
  }

  try {
    const stream = createReadStream(absPath);
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return new Response('Lỗi khi đọc thumbnail.', { status: 500 });
  }
}
