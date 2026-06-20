// E1 step 09 — EDITORIAL caption copywriter. The montage's on-screen captions
// must NOT be a verbatim transcript of the spoken VO (rambling, chopped). This
// writes punchy viral captions: one hook + one short reaction per catch,
// anchored on each money-shot, then RE-RENDERS only the caption layer onto the
// existing montage preview (fast — no re-cut/re-voice/re-render).
// VO audio (translated narration) stays untouched.
//   pnpm tsx scripts/ent-vlog/09-caption-content.ts --id ent_squid_001
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { requireOpenAIKey, workDir } from './lib/env.js';
import { chatJson } from './lib/openai.js';

const SYSTEM = `Bạn viết CAPTION ĐÈ MÀN cho video viral câu cá/mực TikTok tiếng Việt (kiểu giật tít + reaction, GIỐNG creator Trung Quốc để chữ to trên màn — KHÔNG phải phụ đề lời nói).
Yêu cầu:
- 1 "hook" mở đầu cực ngắn, hút mắt (≤5 từ), có thể 1 emoji.
- Mỗi cú "cá/mực lên" → 1 câu reaction NGẮN, MẠNH (≤6 từ), kiểu "DÍNH RỒI!", "CON NÀY BỰ THIỆT!", "LÊN LIÊN TỤC!".
- Tiếng Việt đời thường, năng lượng cao, IN HOA được. KHÔNG lảm nhảm, KHÔNG bịa số liệu, KHÔNG dài dòng.
- Trả JSON {"hook":"...","reactions":["...", ...]} với reactions ĐÚNG SỐ LƯỢNG cú được liệt kê, theo thứ tự.`;

interface ReportSeg {
  anchor: string;
  srcStart: number;
  montageStart: number;
}

function parseTc(s: string): number {
  const [m, sec] = s.split(':').map(Number);
  return (m ?? 0) * 60 + (sec ?? 0);
}

interface CharAlign {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
}

/** Distribute a caption line's characters across [t0,t1]. Ends with '!' so the
 *  renderer flushes it as its own chunk (no merging across the time gaps). */
function pushLine(align: CharAlign, rawText: string, t0: number, t1: number): void {
  const text = /[!?.]$/.test(rawText.trim()) ? rawText.trim() : `${rawText.trim()}!`;
  const chars = [...text];
  const per = chars.length > 0 ? (t1 - t0) / chars.length : 0;
  chars.forEach((c, i) => {
    align.characters.push(c);
    align.characterStartTimesSeconds.push(t0 + i * per);
    align.characterEndTimesSeconds.push(t0 + (i + 1) * per);
  });
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { id: { type: 'string' } }, strict: true });
  const id = values.id;
  if (!id) {
    console.error('Usage: --id <slug>');
    process.exit(1);
  }
  const dir = workDir(id);
  const clipDir = join(dir, 'montage');
  const reportPath = join(clipDir, 'montage_report.json');
  const previewMp4 = join(clipDir, 'render', 'preview.mp4');
  const maskPath = join(clipDir, 'source_subtitle_mask.json');
  if (!existsSync(reportPath) || !existsSync(previewMp4)) {
    console.error('🛑 Thiếu montage_report.json / render/preview.mp4 — chạy 08-montage trước.');
    process.exit(1);
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as { segments: ReportSeg[] };
  const catchPath = join(dir, 'catch_moments.json');
  const whatByT = new Map<number, string>();
  if (existsSync(catchPath)) {
    const cm = JSON.parse(readFileSync(catchPath, 'utf8')) as {
      moments: Array<{ tSec: number; what: string }>;
    };
    for (const m of cm.moments) whatByT.set(Math.round(m.tSec), m.what);
  }

  // Money-shot montage time per segment.
  const segs = report.segments.map((s) => {
    const anchorSec = parseTc(s.anchor);
    return {
      anchorSec,
      what: whatByT.get(Math.round(anchorSec)) ?? 'cá/mực vừa câu lên, đang giơ lên',
      moneyShotMontage: s.montageStart + (anchorSec - s.srcStart),
    };
  });

  // Copywrite editorial captions.
  const apiKey = requireOpenAIKey();
  console.log(`[09] Viết caption editorial cho ${segs.length} cú…`);
  const cw = await chatJson<{ hook?: string; reactions?: string[] }>(apiKey, {
    system: SYSTEM,
    user: [
      'Bối cảnh: vlog săn mực Biển Đông, montage nhiều cú lên mực.',
      `Số cú (theo thứ tự thời gian): ${segs.length}`,
      ...segs.map((s, i) => `Cú ${i + 1}: ${s.what}`),
    ].join('\n'),
    temperature: 0.8,
  });
  const hook = (cw.hook ?? 'BIỂN ĐÔNG SĂN MỰC 🦑').trim();
  const reactions = cw.reactions ?? [];

  // Place: hook over the opening, one reaction near each money-shot. Skip any
  // reaction that would collide with the hook window (the intro shot).
  const align: CharAlign = {
    characters: [],
    characterStartTimesSeconds: [],
    characterEndTimesSeconds: [],
  };
  const HOOK_T0 = 0.4;
  const HOOK_T1 = 4.2;
  pushLine(align, hook, HOOK_T0, HOOK_T1);
  const placed: Array<{ text: string; t0: number; t1: number }> = [
    { text: hook, t0: HOOK_T0, t1: HOOK_T1 },
  ];
  segs.forEach((s, i) => {
    const text = reactions[i];
    if (!text) return;
    let t0 = s.moneyShotMontage - 1.0;
    const t1base = s.moneyShotMontage + 2.6;
    if (t0 < HOOK_T1 + 0.3) return; // under the hook → skip (intro served by hook)
    // avoid overlap with previously placed reaction
    const last = placed[placed.length - 1];
    if (last && t0 < last.t1 + 0.2) t0 = last.t1 + 0.2;
    const t1 = Math.max(t0 + 1.4, t1base);
    pushLine(align, text, t0, t1);
    placed.push({ text, t0, t1 });
  });

  const timingPath = join(clipDir, 'caption_editorial_timing.json');
  writeFileSync(
    timingPath,
    JSON.stringify(
      {
        timingVersion: 'ent-caption-v1',
        runId: `ent_${id}_montage`,
        alignment: align,
        captionReady: true,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(clipDir, 'caption_content.json'),
    JSON.stringify({ hook, reactions, placed }, null, 2),
  );

  // Re-render caption layer onto the existing montage preview.
  const runId = `ent_${id}_montage`;
  mkdirSync(resolve('data/temp/pipeline-p9-demo', runId), { recursive: true });
  const shortOut = join(dir, 'montage_short.mp4');
  const capArgs = [
    'tsx',
    'scripts/kinetic-caption-renderer.ts',
    '--run',
    runId,
    '--preset',
    'viral_review_v2',
    '--timing',
    timingPath,
    '--input',
    previewMp4,
    '--output',
    shortOut,
  ];
  if (existsSync(maskPath)) capArgs.push('--subtitle-mask', maskPath, '--cover-mode', 'delogo');
  console.log('[09] Re-render lớp caption editorial (viral_review_v2 + delogo)…');
  const r = spawnSync('npx', capArgs, { encoding: 'utf8', shell: true, stdio: 'pipe' });
  if (r.status !== 0 || !existsSync(shortOut)) {
    console.error('🛑 CAPTION_RERENDER_FAILED');
    console.error((r.stdout ?? '').slice(-500));
    console.error((r.stderr ?? '').slice(-700));
    process.exit(2);
  }

  console.log('------------------------------------------------------');
  console.log('[09] ✅ Caption editorial:');
  console.log(`     HOOK: ${hook}`);
  for (const p of placed.slice(1)) console.log(`     ${p.t0.toFixed(1)}s: ${p.text}`);
  console.log(`     OUTPUT: ${shortOut}`);
  console.log('------------------------------------------------------');
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
