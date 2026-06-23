// E1 step 03 — clip-mining: pick 3-6 highlight windows (70-90s) from the
// Chinese transcript via gpt-4o. Snaps windows to ASR segment boundaries.
//   pnpm tsx scripts/ent-vlog/03-clip-mine.ts --id ent_squid_001
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { requireOpenAIKey, workDir } from './lib/env.js';
import { type AsrSegment, chatJson } from './lib/openai.js';

const CLIP_MIN = 70;
const CLIP_MAX = 90;

const SYSTEM = `Bạn là biên tập video ngắn cho TikTok, mảng vlog CÂU CÁ.
Từ transcript (tiếng Trung, có mốc thời gian), chọn các KHOẢNH KHẮC HAY NHẤT để cắt thành short.
Ưu tiên: cao trào (dính cá, kéo cá/mực lớn, giật mạnh), reveal kết quả, câu nói hài/cảm xúc, hành động rõ.
Tránh: đoạn dạo đầu lê thê, im lặng, lặp.
Mỗi clip phải DÀI 70-90 GIÂY, liền mạch, KHÔNG chồng lấn nhau. Chọn 3-6 clip. Trả JSON.`;

interface ModelClip {
  startSec: number;
  endSec: number;
  reasonVi: string;
  score: number;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { id: { type: 'string' } }, strict: true });
  const id = values.id;
  if (!id) {
    console.error('Usage: --id <slug>');
    process.exit(1);
  }
  const dir = workDir(id);
  const asrPath = join(dir, 'asr_zh.json');
  if (!existsSync(asrPath)) {
    console.error('🛑 asr_zh.json missing — chạy 02-asr-zh trước.');
    process.exit(1);
  }
  const asr = JSON.parse(readFileSync(asrPath, 'utf8')) as {
    durationSec: number;
    segments: AsrSegment[];
  };
  const segments = asr.segments;
  if (segments.length === 0) {
    console.error('🛑 NO_SEGMENTS: không có lời để cắt clip.');
    process.exit(2);
  }

  const totalDur = asr.durationSec || segments[segments.length - 1]?.end || 0;

  // Short video: one clip = whole thing.
  if (totalDur <= CLIP_MAX + 10) {
    const clip = {
      clipId: 'clip_1',
      startSec: Number((segments[0]?.start ?? 0).toFixed(2)),
      endSec: Number((segments[segments.length - 1]?.end ?? totalDur).toFixed(2)),
      durationSec: Number(totalDur.toFixed(2)),
      reasonVi: 'Video ngắn — dùng nguyên đoạn.',
      score: 5,
      segmentIds: segments.map((s) => s.id),
    };
    writeFileSync(
      join(dir, 'clip_candidates.json'),
      JSON.stringify({ videoId: id, totalDurationSec: totalDur, clips: [clip] }, null, 2),
    );
    console.log('[03] ✅ Video ngắn → 1 clip nguyên đoạn.');
    return;
  }

  const apiKey = requireOpenAIKey();
  const user = [
    `Tổng thời lượng: ${totalDur.toFixed(0)}s. Mỗi clip 70-90s.`,
    'Trả JSON: {"clips":[{"startSec":<number>,"endSec":<number>,"reasonVi":"<vì sao hay>","score":<1-10>}]}',
    '',
    'Transcript (id | start-end | 中文):',
    ...segments.map((s) => `${s.id} | ${s.start.toFixed(0)}-${s.end.toFixed(0)}s | ${s.text}`),
  ].join('\n');

  console.log('[03] Calling gpt-4o để chọn clip hay…');
  const res = await chatJson<{ clips: ModelClip[] }>(apiKey, {
    system: SYSTEM,
    user,
    temperature: 0.4,
  });

  // The model returns highlight MOMENTS (often short). Expand each around its
  // peak into a 70-90s window snapped to segment boundaries, then de-overlap.
  const n = segments.length;
  const winDur = (lo: number, hi: number): number => {
    const a = segments[lo];
    const b = segments[hi];
    return a && b ? b.end - a.start : 0;
  };
  // Peak = segment index range that overlaps the model window.
  const peakRange = (ws: number, we: number): [number, number] | null => {
    let lo = -1;
    let hi = -1;
    for (let i = 0; i < n; i += 1) {
      const s = segments[i];
      if (s && s.end > ws && s.start < we) {
        if (lo === -1) lo = i;
        hi = i;
      }
    }
    return lo === -1 ? null : [lo, hi];
  };
  // Grow outward (keep highlight ~centered) until window ≥ CLIP_MIN seconds.
  const expand = (lo0: number, hi0: number): [number, number] => {
    let lo = lo0;
    let hi = hi0;
    let guard = 0;
    while (winDur(lo, hi) < CLIP_MIN && guard < n * 2) {
      guard += 1;
      const canBefore = lo > 0;
      const canAfter = hi < n - 1;
      if (!canBefore && !canAfter) break;
      const beforeAdded = lo0 - lo;
      const afterAdded = hi - hi0;
      if (canAfter && (!canBefore || afterAdded <= beforeAdded)) hi += 1;
      else if (canBefore) lo -= 1;
      else hi += 1;
    }
    return [lo, hi];
  };

  const ranked = (res.clips ?? [])
    .map((c) => {
      const peak = peakRange(c.startSec, c.endSec);
      if (!peak) return null;
      const [lo, hi] = expand(peak[0], peak[1]);
      const a = segments[lo];
      const b = segments[hi];
      if (!a || !b) return null;
      return {
        lo,
        hi,
        startSec: Number(a.start.toFixed(2)),
        endSec: Number(b.end.toFixed(2)),
        durationSec: Number((b.end - a.start).toFixed(2)),
        reasonVi: c.reasonVi ?? '',
        score: typeof c.score === 'number' ? c.score : 5,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => b.score - a.score);

  // Greedy de-overlap: accept highest score first, skip if >50% overlap.
  const accepted: typeof ranked = [];
  for (const c of ranked) {
    const clash = accepted.some((a) => {
      const ov = Math.max(0, Math.min(a.endSec, c.endSec) - Math.max(a.startSec, c.startSec));
      return ov > 0.5 * Math.min(a.durationSec, c.durationSec);
    });
    if (!clash) accepted.push(c);
    if (accepted.length >= 6) break;
  }

  const clips = accepted.map((c, i) => ({
    clipId: `clip_${i + 1}`,
    startSec: c.startSec,
    endSec: c.endSec,
    durationSec: c.durationSec,
    reasonVi: c.reasonVi,
    score: c.score,
    segmentIds: segments.slice(c.lo, c.hi + 1).map((s) => s.id),
  }));

  if (clips.length === 0) {
    console.error('🛑 NO_CLIPS_FOUND: model không trả clip hợp lệ.');
    process.exit(3);
  }

  writeFileSync(
    join(dir, 'clip_candidates.json'),
    JSON.stringify({ videoId: id, totalDurationSec: totalDur, clips }, null, 2),
  );

  console.log('------------------------------------------------------');
  console.log(`[03] ✅ ${clips.length} clip ứng viên:`);
  for (const c of clips) {
    console.log(
      `     ${c.clipId} | ${c.startSec.toFixed(0)}-${c.endSec.toFixed(0)}s (${c.durationSec.toFixed(0)}s) | score ${c.score} | ${c.reasonVi}`,
    );
  }
  console.log('------------------------------------------------------');
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
