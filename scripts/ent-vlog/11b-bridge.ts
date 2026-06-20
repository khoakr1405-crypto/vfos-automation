// E1 step 11b — insert SHORT bridge chunks into the silent gaps between catches.
// NO API: bridges are predefined casual one-liners (operator-approved style)
// placed deterministically inside the inter-catch gaps so the montage feels
// denser ("dồn dập") without crowding captions or spilling voice over a
// money-shot. Reads + rewrites montage_v2_script.json and the review .md.
// Idempotent: strips any prior bridge beats first, so it can be re-run.
// Caption still == voice text (same beat.text → hash audit holds at render).
//   pnpm tsx scripts/ent-vlog/11b-bridge.ts --id ent_squid_001
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { workDir } from './lib/env.js';

const DEFAULT_ANCHORS = [3.5, 136.5, 227.5, 290.5, 346.5];
const LEAD = 14;
const REACTION = 9;

// Bridge one-liners per inter-catch gap. Short, casual, keeps the "càng câu
// càng cuốn" rhythm without inventing scene content.
const BRIDGES: Array<{ after: number; before: number; lines: string[] }> = [
  { after: 1, before: 2, lines: ['Tưởng nghỉ rồi chứ gì?', 'Không, còn tiếp nha.'] },
  { after: 2, before: 3, lines: ['Đoạn này bắt đầu cuốn.', 'Cần vừa rung là biết.'] },
  { after: 3, before: 4, lines: ['Chưa kịp thở nữa.', 'Lại chuẩn bị lên hàng.'] },
];

interface Beat {
  role: string;
  sceneIdx?: number;
  text: string;
  montageTime: number;
  estSec: number;
}

function tc(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

function estRead(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(0.7, Number((words * 0.26 + 0.35).toFixed(2)));
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function spread(n: number, t0: number, t1: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [(t0 + t1) / 2];
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push(t0 + (i / (n - 1)) * (t1 - t0));
  return out;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { id: { type: 'string' } }, strict: true });
  const id = values.id;
  if (!id) {
    console.error('Usage: --id <slug>');
    process.exit(1);
  }
  const dir = workDir(id);
  const clipDir = join(dir, 'montage_v2');
  const jsonPath = join(clipDir, 'montage_v2_script.json');
  const script = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
    videoId: string;
    montageTotalSec: number;
    reviewStatus: string;
    scriptModel: string;
    vibe: string;
    beats: Beat[];
  };
  const meta = JSON.parse(readFileSync(join(dir, 'source_meta.json'), 'utf8')) as {
    durationSec: number;
  };

  // Rebuild the SAME montage segment structure (for msLabel + spill check).
  let running = 0;
  const segs = [...DEFAULT_ANCHORS].sort((a, b) => a - b).map((tSec, idx) => {
    const srcStart = Math.max(0, tSec - LEAD);
    const srcEnd = Math.min(meta.durationSec, tSec + REACTION);
    const dur = srcEnd - srcStart;
    const montageStart = running;
    running += dur;
    return { idx, tSec, srcStart, srcEnd, dur, montageStart };
  });
  const montageTotal = script.montageTotalSec || running;
  const msMontage = (idx: number): number | null => {
    const s = segs[idx];
    return s ? s.montageStart + (s.tSec - s.srcStart) : null;
  };
  const msLabel = (idx?: number): string | null => {
    if (idx == null) return null;
    const m = msMontage(idx);
    return m == null ? null : tc(m);
  };

  // Strip any prior bridge beats so re-runs are idempotent.
  const baseBeats = script.beats.filter((b) => b.role !== 'bridge');

  // Insert bridges into each requested gap.
  const added: Array<{ gap: string; lines: string[] }> = [];
  const bridgeBeats: Beat[] = [];
  for (const br of BRIDGES) {
    const afterTimes = baseBeats
      .filter((b) => b.sceneIdx === br.after)
      .map((b) => b.montageTime)
      .sort((a, b) => a - b);
    const beforeTimes = baseBeats
      .filter((b) => b.sceneIdx === br.before)
      .map((b) => b.montageTime)
      .sort((a, b) => a - b);
    const last = afterTimes[afterTimes.length - 1];
    const first = beforeTimes[0];
    if (last == null || first == null) continue;
    const t0 = last + 1.8;
    const t1 = first - 1.8;
    if (t1 <= t0) continue; // no room — skip rather than crowd
    for (const [i, t] of spread(br.lines.length, t0, t1).entries()) {
      const line = br.lines[i];
      if (!line) continue;
      bridgeBeats.push({
        role: 'bridge',
        text: line.trim(),
        montageTime: Number(t.toFixed(1)),
        estSec: estRead(line),
      });
    }
    added.push({
      gap: `cú ${msLabel(br.after)} → cú ${msLabel(br.before)}`,
      lines: br.lines,
    });
  }

  const beats = [...baseBeats, ...bridgeBeats].sort((a, b) => a.montageTime - b.montageTime);
  // Mild monotonic nudge (0.8s floor) — keeps montage rhythm, no big stretch.
  const MIN_GAP = 0.8;
  for (let i = 1; i < beats.length; i += 1) {
    const prev = beats[i - 1];
    const cur = beats[i];
    if (!prev || !cur) continue;
    if (cur.montageTime < prev.montageTime + MIN_GAP) {
      cur.montageTime = Number(Math.min(montageTotal - 0.3, prev.montageTime + MIN_GAP).toFixed(2));
    }
  }

  // QA (estimate only — no voice yet).
  const totalSpeech = Number(beats.reduce((s, b) => s + b.estSec, 0).toFixed(1));
  let crowded = 0;
  let maxOver = 0;
  let maxSilence = 0;
  for (let i = 0; i < beats.length; i += 1) {
    const cur = beats[i];
    if (!cur) continue;
    const next = beats[i + 1];
    const nextStart = next ? next.montageTime : montageTotal;
    const window = nextStart - cur.montageTime;
    if (cur.estSec > window + 0.05) {
      crowded += 1;
      maxOver = Math.max(maxOver, Number((cur.estSec - window).toFixed(2)));
    }
    const silence = nextStart - (cur.montageTime + cur.estSec);
    if (silence > maxSilence) maxSilence = Number(silence.toFixed(1));
  }
  const longChunks = beats.filter((b) => wordCount(b.text) > 10);
  const catchSegs = segs.filter((s) => s.idx >= 1);
  const spills: string[] = [];
  for (const seg of catchSegs) {
    const next = catchSegs.find((s) => s.idx === seg.idx + 1);
    if (!next) continue;
    const mine = beats.filter((b) => b.sceneIdx === seg.idx);
    const lastB = mine[mine.length - 1];
    const nextMs = msMontage(next.idx);
    if (!lastB || nextMs == null) continue;
    if (lastB.montageTime + lastB.estSec > nextMs)
      spills.push(`cú ${msLabel(seg.idx)} → đè money-shot ${msLabel(next.idx)}`);
  }

  // Rewrite JSON.
  const outJson = {
    ...script,
    chunkCount: beats.length,
    estTotalSpeechSec: totalSpeech,
    bridgesAdded: added.length,
    beats,
  };
  writeFileSync(jsonPath, JSON.stringify(outJson, null, 2));

  // Rewrite review .md.
  const hook = beats.find((b) => b.role === 'hook')?.text ?? '(—)';
  const md: string[] = [];
  md.push('# Script review — montage_v2 (⛔ CHỜ DUYỆT, chưa voice/render)');
  md.push('');
  md.push(`- Video: ${id} | tổng ${montageTotal.toFixed(1)}s | ${catchSegs.length} cú mực lên + cảnh mở đầu`);
  md.push(`- Script model: ${script.scriptModel} (vision: gpt-4o, cached) + ${added.length} cầu nối (no-API)`);
  md.push(`- Không khí: ${script.vibe || '(—)'}`);
  md.push(`- Số cụm voice/caption: **${beats.length}** | ước tính tổng đọc: **~${totalSpeech}s** / ${montageTotal.toFixed(1)}s`);
  md.push('');
  md.push(`## HOOK\n**${hook}**`);
  md.push('');
  md.push('## VOICEOVER / CAPTION CHUNKS (theo thời gian — caption = ĐÚNG text này)');
  md.push('| # | time | ~đọc | role | cú | text | từ |');
  md.push('|---|---|---|---|---|---|---|');
  for (const [i, b] of beats.entries()) {
    md.push(
      `| ${i + 1} | ${tc(b.montageTime)} | ${b.estSec}s | ${b.role} | ${msLabel(b.sceneIdx) ?? '—'} | ${b.text.replace(/\|/g, '/')} | ${wordCount(b.text)} |`,
    );
  }
  md.push('');
  md.push('## ĐÃ BỊT KHOẢNG LẶNG (cầu nối thêm, no-API)');
  for (const a of added) md.push(`- ${a.gap}: ${a.lines.map((l) => `“${l}”`).join(' · ')}`);
  md.push('');
  md.push('## QA / RỦI RO (ước tính, chưa có voice thật)');
  md.push(`- Tổng đọc ~${totalSpeech}s trong ${montageTotal.toFixed(1)}s → ${totalSpeech < montageTotal ? '✅ còn dư thời lượng' : '⚠️ kín, dễ tràn'}.`);
  md.push(`- Khoảng lặng dài nhất giữa 2 cụm: ~${maxSilence}s ${maxSilence > 8 ? '⚠️ (còn hơi thưa)' : '✅'}.`);
  md.push(`- Cụm dài >10 từ: ${longChunks.length === 0 ? '✅ không có' : `⚠️ ${longChunks.length} cụm`}.`);
  md.push(`- Caption chật (đọc lâu hơn khoảng tới cụm sau): ${crowded === 0 ? '✅ không' : `⚠️ ${crowded} cụm, tràn tối đa ~${maxOver}s`}.`);
  md.push(`- Voice tràn sang money-shot CÚ KẾ: ${spills.length === 0 ? '✅ không' : `⚠️ ${spills.join('; ')}`}.`);
  md.push('');
  md.push('> ⛔ Duyệt: sửa trực tiếp field `text` trong `montage_v2_script.json` nếu cần, rồi báo "duyệt script" để chạy voice + render.');
  writeFileSync(join(clipDir, 'montage_v2_script_review.md'), md.join('\n'));

  console.log('------------------------------------------------------');
  console.log(`[11b] ✅ Đã chèn ${bridgeBeats.length} cầu nối → ${beats.length} cụm (chưa voice/render).`);
  console.log(`      Tổng đọc ~${totalSpeech}s / ${montageTotal.toFixed(1)}s | lặng dài nhất ~${maxSilence}s | chật:${crowded} tràn-cú-kế:${spills.length}`);
  console.log('      ⛔ DỪNG — chờ Operator duyệt.');
  console.log('------------------------------------------------------');
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
