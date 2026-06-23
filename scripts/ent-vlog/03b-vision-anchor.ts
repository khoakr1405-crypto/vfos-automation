// E1 step 03b — VISION-anchored catch detection. Samples frames across the
// source and asks gpt-4o vision to score each for "a freshly caught fish/squid
// is being held up / shown to camera" (the money shot). Outputs the real catch
// moments (timestamps) so clips/edits can be ANCHORED on the visual catch
// instead of guessed from the transcript. Cheap: detail:'low' frames, batched.
//   pnpm tsx scripts/ent-vlog/03b-vision-anchor.ts --id ent_squid_001 [--interval 7] [--threshold 5]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { requireOpenAIKey, workDir } from './lib/env.js';
import { chatVisionJson } from './lib/openai.js';

const SYSTEM = `Bạn chấm điểm khung hình video CÂU CÁ.
Với mỗi frame, cho điểm 0-10 mức độ rõ ràng có MỘT CON CÁ/MỰC VỪA CÂU LÊN đang được GIƠ LÊN / khoe ra camera (khoảnh khắc "cá lên").
0 = chỉ nước/thuyền/người/cần câu, không có cá trên tay. 10 = rõ ràng đang cầm/giơ con cá hoặc mực vừa bắt.
Trả JSON {"scores":[{"score":<0-10>,"what":"<mô tả cực ngắn>"}]} — ĐÚNG THỨ TỰ và ĐÚNG SỐ LƯỢNG frame được cung cấp.`;

function tc(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      id: { type: 'string' },
      interval: { type: 'string' },
      threshold: { type: 'string' },
      batch: { type: 'string' },
    },
    strict: true,
  });
  const id = values.id;
  if (!id) {
    console.error('Usage: --id <slug> [--interval 7] [--threshold 5]');
    process.exit(1);
  }
  const interval = values.interval ? Math.max(2, Number(values.interval)) : 7;
  const threshold = values.threshold ? Number(values.threshold) : 5;
  const batchSize = values.batch ? Math.max(4, Number(values.batch)) : 12;

  const dir = workDir(id);
  const metaPath = join(dir, 'source_meta.json');
  if (!existsSync(metaPath)) {
    console.error('🛑 source_meta.json missing — chạy 01-fetch-source trước.');
    process.exit(1);
  }
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { path: string; durationSec: number };
  const apiKey = requireOpenAIKey();

  // Sample frames at exact timestamps for accurate anchoring.
  const tmp = join(dir, '_vision_tmp');
  mkdirSync(tmp, { recursive: true });
  const timestamps: number[] = [];
  for (let t = interval / 2; t < meta.durationSec; t += interval)
    timestamps.push(Number(t.toFixed(1)));
  console.log(`[03b] Lấy ${timestamps.length} frame mỗi ${interval}s…`);
  const frames: Array<{ t: number; b64: string }> = [];
  for (const t of timestamps) {
    const fp = join(tmp, `f_${String(Math.round(t)).padStart(4, '0')}.jpg`);
    const r = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-ss',
        String(t),
        '-i',
        meta.path,
        '-frames:v',
        '1',
        '-vf',
        'scale=512:-1',
        '-q:v',
        '6',
        fp,
      ],
      { encoding: 'utf8' },
    );
    if (r.status === 0 && existsSync(fp)) {
      frames.push({ t, b64: readFileSync(fp).toString('base64') });
    }
  }
  if (frames.length === 0) {
    console.error('🛑 Không lấy được frame nào.');
    process.exit(2);
  }

  // Batch the frames through vision scoring.
  console.log(`[03b] Vision chấm ${frames.length} frame (gpt-4o, batch ${batchSize})…`);
  const scored: Array<{ t: number; score: number; what: string }> = [];
  for (let i = 0; i < frames.length; i += batchSize) {
    const batch = frames.slice(i, i + batchSize);
    const res = await chatVisionJson<{ scores?: Array<{ score?: number; what?: string }> }>(
      apiKey,
      {
        system: SYSTEM,
        userText: `Chấm ${batch.length} frame sau (đúng thứ tự).`,
        images: batch.map((f) => ({ label: `t=${f.t}s`, base64: f.b64 })),
      },
    );
    const arr = res.scores ?? [];
    for (let j = 0; j < batch.length; j += 1) {
      const bf = batch[j];
      if (!bf) continue;
      const sc = arr[j];
      scored.push({
        t: bf.t,
        score: typeof sc?.score === 'number' ? sc.score : 0,
        what: sc?.what ?? '',
      });
    }
  }

  // Cluster contiguous high-score frames → keep the peak of each catch moment.
  scored.sort((a, b) => a.t - b.t);
  const moments: Array<{ tSec: number; score: number; what: string }> = [];
  let cluster: typeof scored = [];
  const flush = () => {
    if (cluster.length === 0) return;
    const peak = cluster.reduce((best, c) => (c.score > best.score ? c : best));
    moments.push({ tSec: peak.t, score: peak.score, what: peak.what });
    cluster = [];
  };
  for (const s of scored) {
    if (s.score >= threshold) {
      const last = cluster[cluster.length - 1];
      if (last && s.t - last.t > interval * 1.6) flush();
      cluster.push(s);
    } else {
      flush();
    }
  }
  flush();

  writeFileSync(
    join(dir, 'catch_moments.json'),
    JSON.stringify(
      { videoId: id, durationSec: meta.durationSec, interval, threshold, moments },
      null,
      2,
    ),
  );

  console.log('------------------------------------------------------');
  console.log(`[03b] ✅ ${moments.length} mốc "cá lên" (score ≥ ${threshold}):`);
  for (const m of moments) {
    console.log(`     ${tc(m.tSec)} (t=${m.tSec}s) | score ${m.score} | ${m.what}`);
  }
  // Show a few near-misses for context.
  const near = scored.filter((s) => s.score >= threshold - 2 && s.score < threshold);
  if (near.length > 0) {
    console.log(`     (gần ngưỡng: ${near.map((n) => `${tc(n.t)}=${n.score}`).join(', ')})`);
  }
  console.log('------------------------------------------------------');
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
