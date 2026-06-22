// E1 step 13 — SOURCE-BOUND script (CONTENT GATE).
// New direction: stop inventing. Bind to the ORIGINAL narration of the cut
// segments. Slices the EXISTING asr_zh.json into the 5 montage windows (no
// re-Whisper), then ONE gpt-5.5 call transcreates each Chinese line into SHORT
// Vietnamese chunks that keep the original meaning + fast rhythm. Chunks are
// placed at the SAME montage time as the original speech → matches the source
// rhythm. Micro-commentary is added ONLY in real silent gaps.
// Output OVERWRITES montage_v2_script.json (so step 12 voices/renders it as-is
// after approval) + writes source_cut_reference.json + a human review .md.
// STOPS — no voice, no render. API: 1 gpt-5.5 text call (no Whisper, no vision).
//   pnpm tsx scripts/ent-vlog/13-source-bound.ts --id ent_squid_001 --model gpt-5.5
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { readAnchorPlan } from './lib/anchors.js';
import { requireOpenAIKey, workDir } from './lib/env.js';
import { type AsrSegment, chatJson } from './lib/openai.js';

const GAP_FOR_MICRO = 2.8; // silence longer than this (s) may get micro-commentary

const SOURCE_BIND_SYS = `Bạn Việt hóa LỜI GỐC của một vlog câu mực Trung Quốc cho người Việt xem TikTok.
NGUYÊN TẮC CỐT LÕI:
- BÁM SÁT ý từng câu gốc. KHÔNG bịa thêm, KHÔNG lan man, KHÔNG dịch máy từng chữ.
- Việt hóa tự nhiên như người Việt đang đi câu mực thật: nhanh, đời thường, hài nhẹ, phản ứng tức thì.
- Bỏ phần thô tục/khó hiểu văn hóa (chửi tục, ẩn dụ địa phương) → chuyển thành phản ứng vui sạch.
- Mỗi câu gốc → CHIA thành 1–N cụm NGẮN: 2–6 từ (tối đa 8). Cụm dễ đọc, dễ nghe.
- Nếu câu gốc chỉ là tiếng cười/đệm (haha, 拿下拿下) → thành 1 cụm phản ứng ngắn (vd "haha", "kéo lên nào").
GAPS: ở các đoạn IM (không có lời gốc), chỉ thêm 1 micro-commentary CỰC NGẮN đúng cảnh đang thấy; nếu không chắc cảnh thì BỎ, không bịa.
Trả JSON: {"lines":[{"id":<number>,"vi":["cụm","cụm"]}],"micro":[{"afterId":<number>,"vi":"cụm ngắn"}]}.`;

interface Beat {
  role: string;
  sceneIdx?: number;
  text: string;
  montageTime: number;
  estSec: number;
  srcId?: number;
}
interface SrcLine {
  id: number;
  sceneIdx: number;
  zh: string;
  mStart: number;
  mEnd: number;
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
  const { values } = parseArgs({
    options: { id: { type: 'string' }, model: { type: 'string' } },
    strict: true,
  });
  const id = values.id;
  if (!id) {
    console.error('Usage: --id <slug> [--model gpt-5.5]');
    process.exit(1);
  }
  const scriptModel = values.model ?? 'gpt-5.5';
  const dir = workDir(id);
  const clipDir = join(dir, 'montage_v2');
  const meta = JSON.parse(readFileSync(join(dir, 'source_meta.json'), 'utf8')) as {
    durationSec: number;
  };
  const asr = JSON.parse(readFileSync(join(dir, 'asr_zh.json'), 'utf8')) as {
    segments: AsrSegment[];
  };
  const visPath = join(clipDir, '_vis', 'vision_scenes.json');
  const sceneDesc = new Map<number, string>();
  if (existsSync(visPath)) {
    const vis = JSON.parse(readFileSync(visPath, 'utf8')) as {
      scenes?: Array<{ idx: number; desc: string }>;
    };
    for (const s of vis.scenes ?? []) sceneDesc.set(s.idx, s.desc);
  }
  const apiKey = requireOpenAIKey();

  // Rebuild montage segments — ĐÚNG anchors money-shot (anchors.json, dùng chung
  // 10/12/15) để script bám đúng timeline. KHÔNG hardcode.
  const plan = readAnchorPlan(dir);
  let running = 0;
  const segs = [...plan.anchors]
    .sort((a, b) => a - b)
    .map((tSec, idx) => {
      const srcStart = Math.max(0, tSec - plan.lead);
      const srcEnd = Math.min(meta.durationSec, tSec + plan.reaction);
      const dur = srcEnd - srcStart;
      const montageStart = running;
      running += dur;
      return { idx, tSec, srcStart, srcEnd, dur, montageStart };
    });
  const montageTotal = running;
  const msMontage = (idx: number): number => {
    const s = segs[idx];
    return s ? s.montageStart + (s.tSec - s.srcStart) : 0;
  };

  // 1) SOURCE CUT REFERENCE: slice ASR into each window, map to montage time.
  const srcLines: SrcLine[] = [];
  for (const seg of segs) {
    for (const a of asr.segments) {
      if (a.end <= seg.srcStart || a.start >= seg.srcEnd) continue;
      if (!a.text.trim()) continue;
      const s = Math.max(a.start, seg.srcStart);
      const e = Math.min(a.end, seg.srcEnd);
      srcLines.push({
        id: a.id,
        sceneIdx: seg.idx,
        zh: a.text.trim(),
        mStart: Number((seg.montageStart + (s - seg.srcStart)).toFixed(2)),
        mEnd: Number((seg.montageStart + (e - seg.srcStart)).toFixed(2)),
      });
    }
  }
  srcLines.sort((a, b) => a.mStart - b.mStart);
  writeFileSync(
    join(clipDir, 'source_cut_reference.json'),
    JSON.stringify(
      { videoId: id, montageTotalSec: Number(montageTotal.toFixed(1)), lines: srcLines },
      null,
      2,
    ),
  );

  // Detect silent gaps (for micro-commentary).
  const gaps: Array<{ afterId: number; at: number; dur: number; sceneIdx: number }> = [];
  for (let i = 0; i < srcLines.length - 1; i += 1) {
    const cur = srcLines[i];
    const next = srcLines[i + 1];
    if (!cur || !next) continue;
    const dur = next.mStart - cur.mEnd;
    if (dur > GAP_FOR_MICRO) {
      gaps.push({
        afterId: cur.id,
        at: Number(((cur.mEnd + next.mStart) / 2).toFixed(2)),
        dur: Number(dur.toFixed(1)),
        sceneIdx: next.sceneIdx,
      });
    }
  }

  // 2) ONE gpt-5.5 call: bind transcreation (split into short chunks) + micro.
  console.log(`[13] ${scriptModel} Việt hóa BÁM GỐC ${srcLines.length} câu + ${gaps.length} gap…`);
  const out = await chatJson<{
    lines?: Array<{ id: number; vi: string[] }>;
    micro?: Array<{ afterId: number; vi: string }>;
  }>(apiKey, {
    model: scriptModel,
    system: SOURCE_BIND_SYS,
    user: [
      `Bối cảnh: montage săn mực Biển Đông, ${segs.length - 1} cú mực lên. Mục tiêu TỔNG ~40–55 cụm ngắn cho ${Math.round(montageTotal)}s.`,
      'LỜI GỐC (Việt hóa bám sát, chia cụm ngắn 2–6 từ):',
      ...srcLines.map((l) => `[${tc(l.mStart)} | id${l.id}] ${l.zh}`),
      gaps.length > 0 ? '\nGAPS im (thêm micro-commentary ngắn ĐÚNG cảnh, không chắc thì bỏ):' : '',
      ...gaps.map(
        (g) =>
          `[${tc(g.at)} | sau id${g.afterId} | im ~${g.dur}s | cảnh: ${sceneDesc.get(g.sceneIdx) ?? 'mực/biển'}]`,
      ),
    ].join('\n'),
    temperature: 0.7,
  });

  const viById = new Map((out.lines ?? []).map((l) => [l.id, l.vi.filter((x) => x.trim())]));
  const microByAfter = new Map<number, string[]>();
  for (const m of out.micro ?? []) {
    if (!m.vi.trim()) continue;
    const arr = microByAfter.get(m.afterId) ?? [];
    arr.push(m.vi.trim());
    microByAfter.set(m.afterId, arr);
  }

  // 3) Place chunks on the montage timeline following the SOURCE timing.
  const beats: Beat[] = [];
  let boundCount = 0;
  let microCount = 0;
  for (const l of srcLines) {
    const chunks = viById.get(l.id) ?? [];
    // spread chunks across the source line's montage span (rhythm match).
    const span = Math.max(l.mEnd - l.mStart, 0.6 * Math.max(1, chunks.length));
    for (const [i, t] of spread(chunks.length, l.mStart, l.mStart + span).entries()) {
      const text = chunks[i];
      if (!text) continue;
      beats.push({
        role: 'bound',
        sceneIdx: l.sceneIdx >= 1 ? l.sceneIdx : undefined,
        text,
        montageTime: Number(t.toFixed(2)),
        estSec: estRead(text),
        srcId: l.id,
      });
      boundCount += 1;
    }
    // micro fillers that follow this line's gap.
    const micros = microByAfter.get(l.id) ?? [];
    const gap = gaps.find((g) => g.afterId === l.id);
    for (const [i, t] of spread(
      micros.length,
      gap ? gap.at - 0.6 : l.mEnd + 0.8,
      gap ? gap.at + 0.6 : l.mEnd + 1.4,
    ).entries()) {
      const text = micros[i];
      if (!text) continue;
      beats.push({ role: 'micro', text, montageTime: Number(t.toFixed(2)), estSec: estRead(text) });
      microCount += 1;
    }
  }
  beats.sort((a, b) => a.montageTime - b.montageTime);
  // Enforce min spacing so edge audio chunks don't garble (and densify gaps).
  const MIN_GAP = 1.0;
  for (let i = 1; i < beats.length; i += 1) {
    const prev = beats[i - 1];
    const cur = beats[i];
    if (!prev || !cur) continue;
    if (cur.montageTime < prev.montageTime + MIN_GAP) {
      cur.montageTime = Number(Math.min(montageTotal - 0.3, prev.montageTime + MIN_GAP).toFixed(2));
    }
  }

  // 4) QA.
  const totalSpeech = Number(beats.reduce((s, b) => s + b.estSec, 0).toFixed(1));
  let crowded = 0;
  let maxOver = 0;
  let maxGap = 0;
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
    if (silence > maxGap) maxGap = Number(silence.toFixed(1));
  }
  const longChunks = beats.filter((b) => wordCount(b.text) > 8);

  // 5) Write step-12-compatible script JSON (overwrite) + review .md.
  const scriptJson = {
    videoId: id,
    montageTotalSec: Number(montageTotal.toFixed(1)),
    reviewStatus: 'PENDING_OPERATOR_REVIEW',
    scriptModel,
    sourceBound: true,
    chunkCount: beats.length,
    boundChunks: boundCount,
    microChunks: microCount,
    estTotalSpeechSec: totalSpeech,
    beats,
  };
  writeFileSync(join(clipDir, 'montage_v2_script.json'), JSON.stringify(scriptJson, null, 2));

  const zhByMontage = new Map(srcLines.map((l) => [l.id, l]));
  const md: string[] = [];
  md.push('# Script review — SOURCE-BOUND (⛔ CHỜ DUYỆT, chưa voice/render)');
  md.push('');
  md.push(
    `- Video: ${id} | tổng ${montageTotal.toFixed(1)}s | bám lời gốc (ASR), không sáng tác mới`,
  );
  md.push(
    `- Model: ${scriptModel} | nguồn: ASR tiếng Trung đã cắt (KHÔNG re-Whisper). OCR caption gốc: tool scrub chỉ cho box, CHƯA trích text → bám lời nói gốc.`,
  );
  md.push(
    `- Cụm: **${beats.length}** (bound ${boundCount} / micro ${microCount}) | ước tính đọc ~${totalSpeech}s / ${montageTotal.toFixed(1)}s`,
  );
  md.push('');
  md.push('## SOURCE TRANSCRIPT (lời gốc đã nhận diện, theo montage time)');
  for (const l of srcLines) md.push(`- [${tc(l.mStart)}] (id${l.id}, cú ${l.sceneIdx}) ${l.zh}`);
  md.push('');
  md.push('## VIỆT HÓA theo timecode (caption = ĐÚNG text này)');
  md.push('| # | time | ~đọc | nguồn | text | từ |');
  md.push('|---|---|---|---|---|---|');
  for (const [i, b] of beats.entries()) {
    const src = b.srcId != null ? `id${b.srcId}` : 'micro+';
    md.push(
      `| ${i + 1} | ${tc(b.montageTime)} | ${b.estSec}s | ${src} | ${b.text.replace(/\|/g, '/')} | ${wordCount(b.text)} |`,
    );
  }
  md.push('');
  md.push('## ĐỐI CHIẾU bám gốc (gốc → Việt)');
  for (const l of srcLines) {
    const ch = (viById.get(l.id) ?? []).join(' / ');
    if (ch) md.push(`- id${l.id} [${tc(l.mStart)}] «${l.zh}» → ${ch}`);
  }
  if (microCount > 0) {
    md.push('');
    md.push('## MICRO-COMMENTARY thêm (đoạn im, đúng cảnh)');
    for (const m of out.micro ?? []) {
      const after = zhByMontage.get(m.afterId);
      md.push(`- sau id${m.afterId}${after ? ` [${tc(after.mEnd)}]` : ''}: “${m.vi}”`);
    }
  }
  md.push('');
  md.push('## QA / RỦI RO (ước tính, chưa có voice thật)');
  md.push(
    `- Số cụm: ${beats.length} ${beats.length >= 40 && beats.length <= 55 ? '✅ (40–55)' : '⚠️ ngoài 40–55'}.`,
  );
  md.push(
    `- Tổng đọc ~${totalSpeech}s / ${montageTotal.toFixed(1)}s → ${totalSpeech < montageTotal ? '✅ còn dư' : '⚠️ kín'}.`,
  );
  md.push(`- Gap lớn nhất giữa 2 cụm: ~${maxGap}s ${maxGap <= 3 ? '✅' : '⚠️ còn quãng chết'}.`);
  md.push(`- Cụm dài >8 từ: ${longChunks.length === 0 ? '✅ không' : `⚠️ ${longChunks.length}`}.`);
  md.push(
    `- Caption chật (ước tính): ${crowded === 0 ? '✅ không' : `⚠️ ${crowded} cụm, tối đa ~${maxOver}s`}.`,
  );
  md.push(`- Bám gốc: ${boundCount}/${beats.length} cụm từ lời gốc; ${microCount} cụm micro thêm.`);
  md.push('');
  md.push(
    '> ⛔ Duyệt: sửa `text` trong `montage_v2_script.json` nếu cần, rồi báo "duyệt script" để chạy voice + render (step 12, không đổi).',
  );
  writeFileSync(join(clipDir, 'montage_v2_script_review.md'), md.join('\n'));

  console.log('------------------------------------------------------');
  console.log(
    `[13] ✅ Bám gốc xong — ${beats.length} cụm (bound ${boundCount}/micro ${microCount}), chưa voice/render.`,
  );
  console.log(
    `     đọc ~${totalSpeech}s / ${montageTotal.toFixed(1)}s | gap lớn nhất ~${maxGap}s | dài>8từ ${longChunks.length}`,
  );
  console.log('     ⛔ DỪNG — chờ Operator duyệt nội dung chữ.');
  console.log('------------------------------------------------------');
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
