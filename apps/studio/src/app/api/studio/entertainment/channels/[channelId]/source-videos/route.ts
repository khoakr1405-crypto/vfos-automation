/* =============================================================================
 * VFOS Studio — Source-channel video lister (multi-channel source binding) — READ-ONLY
 * -----------------------------------------------------------------------------
 * GET /api/studio/entertainment/channels/[channelId]/source-videos?limit=N
 *
 * Liệt kê video MỚI NHẤT của KÊNH NGUỒN (creator Douyin/TikTok TQ) đã gắn cứng cho
 * kênh này, để Operator bấm "Tải link" rồi chọn 1 clip (hoặc lấy clip mới nhất chưa
 * reup). Gắn cờ `alreadyReused` chống reup trùng + trả `latestUnreused` cho nút 1-bấm.
 *
 * Local-only. KHÔNG download media, KHÔNG token/secret. Captcha → DOUYIN_SETUP_REQUIRED
 * (Operator chạy `pnpm ent:douyin-login`), KHÔNG tự vượt (No-Go #4). KHÔNG fallback
 * clip cũ khi lỗi (No-Go #6).
 * ========================================================================== */

import { getChannel } from '@/lib/entertainment/channels';
import { canonicalVideoKey, reusedSourceKeys } from '@/lib/entertainment/jobs';
import { runRepoScript } from '@/lib/studio-data/run-command';

export const dynamic = 'force-dynamic';

const LIST_SCRIPT_REL = 'scripts/ent-vlog/02-list-channel.ts';
const LIST_TIMEOUT_MS = 120_000; // Douyin: browser cold-start + nav + scroll
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host ?? '');
}

interface RawVideo {
  url: string;
  videoId: string | null;
  title?: string;
  durationSec?: number;
  thumbnail?: string;
}
type ListPayload = { ok: true; videos: RawVideo[] } | { ok: false; code: string; message: string };

/** Lấy object JSON cuối cùng trên stdout (phòng khi có log lạ chen trước). */
function parseLastJson(stdout: string): ListPayload | null {
  const lines = (stdout ?? '').split('\n').map((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const l = lines[i];
    if (!l || !l.startsWith('{')) continue;
    try {
      return JSON.parse(l) as ListPayload;
    } catch {
      /* thử dòng trước */
    }
  }
  return null;
}

export async function GET(req: Request, ctx: { params: Promise<{ channelId: string }> }) {
  if (!isLocalRequest(req)) {
    return Response.json({ ok: false, code: 'NOT_LOCAL' }, { status: 403 });
  }
  const { channelId } = await ctx.params;
  if (!/^[A-Za-z0-9_-]+$/.test(channelId)) {
    return Response.json({ ok: false, code: 'BAD_CHANNEL_ID' }, { status: 400 });
  }

  const ch = getChannel(channelId);
  if (!ch) {
    return Response.json(
      { ok: false, code: 'CHANNEL_NOT_FOUND', message: `Không thấy kênh ${channelId}.` },
      { status: 404 },
    );
  }
  const src = ch.sourceChannel;
  if (!src) {
    return Response.json(
      {
        ok: false,
        code: 'NO_SOURCE_CHANNEL',
        message: 'Kênh chưa gắn kênh nguồn TQ — dán URL video tay hoặc bổ sung sourceChannel.',
      },
      { status: 400 },
    );
  }

  const limitParam = Number.parseInt(new URL(req.url).searchParams.get('limit') ?? '12', 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 30) : 12;

  const run = runRepoScript(
    LIST_SCRIPT_REL,
    ['--url', src.url, '--platform', src.platform, '--limit', String(limit)],
    LIST_TIMEOUT_MS,
  );
  const payload = parseLastJson(run.stdout ?? '');
  if (!payload) {
    return Response.json(
      {
        ok: false,
        code: 'LIST_UNREADABLE',
        message: `Không đọc được kết quả list kênh (exit ${run.status}).`,
      },
      { status: 502 },
    );
  }
  if (!payload.ok) {
    // Captcha → mã thống nhất với intake để UI hướng dẫn ent:douyin-login.
    const code = payload.code === 'CAPTCHA' ? 'DOUYIN_SETUP_REQUIRED' : payload.code;
    return Response.json({ ok: false, code, message: payload.message }, { status: 200 });
  }

  const reused = await reusedSourceKeys();
  const videos = payload.videos.map((v) => ({
    url: v.url,
    title: v.title ?? null,
    durationSec: v.durationSec ?? null,
    thumbnail: v.thumbnail ?? null,
    alreadyReused: reused.has(canonicalVideoKey(v.url)),
  }));
  const latestUnreused = videos.find((v) => !v.alreadyReused)?.url ?? null;

  return Response.json({
    ok: true,
    channelId,
    platform: src.platform,
    label: src.label ?? null,
    videos,
    latestUnreused,
    allReused: latestUnreused === null && videos.length > 0,
  });
}
