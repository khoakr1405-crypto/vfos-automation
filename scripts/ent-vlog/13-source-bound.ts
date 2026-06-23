// E1 step 13 — SOURCE-BOUND script (CONTENT GATE) — v2 storytelling.
// Binds to the ORIGINAL narration but writes a COHESIVE, FUNNY Vietnamese VO:
//   - reads the intro ASR (id0..firstWindow) as STORY CONTEXT (persona/jokes)
//     even though the montage only shows money-shots (B-light);
//   - ONE gpt-5.5 call writes FULL SENTENCES (8–14 words, real punctuation) —
//     no more 2–6 word fragments (C); keeps + localizes Chinese memes/slang (D);
//   - a hard QA gate fails on choppy/punct-poor/filler-heavy/hook-less output (E).
// Output OVERWRITES montage_v2_script.json (step 12 voices/renders it as-is after
// approval) + writes source_cut_reference.json + a human review .md.
// STOPS — no voice, no render. API: 1 gpt-5.5 text call (no Whisper, no vision).
//   pnpm tsx scripts/ent-vlog/13-source-bound.ts --id ent_squid_001 --model gpt-5.5
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { readAnchorPlan } from './lib/anchors.js';
import { requireOpenAIKey, workDir } from './lib/env.js';
import { type AsrSegment, chatJson } from './lib/openai.js';

// Đối tượng (subject) theo niche — KHÔNG hardcode 1 loài cho mọi video. Bám VISION.
const NICHE_SUBJECT: Record<string, string> = { 'fishing-vlog': 'cá', squid: 'mực' };
function subjectForNiche(niche: string | undefined, id: string): string {
  if (niche && NICHE_SUBJECT[niche]) return NICHE_SUBJECT[niche];
  if (/squid|muc/i.test(id)) return 'mực';
  return 'cá'; // mặc định trung tính cho lane câu cá
}

// System prompt v2 — tham số hóa theo subject. Luật C (câu đủ + dấu câu),
// D (giữ + Việt hóa meme), giọng kể có nhân vật. Object thật từ VISION ở user-prompt.
function buildScriptSys(subject: string): string {
  return `Bạn viết LỜI BÌNH (voiceover) tiếng Việt cho một vlog đi câu/giải trí ngoài trời (nguồn Trung Quốc) để đăng TikTok Việt.
ĐỐI TƯỢNG đang quay: ${subject.toUpperCase()} (theo VISION khung hình). Gọi ĐÚNG con vật đang thấy; TUYỆT ĐỐI KHÔNG đổi loài.

GIỌNG & NHÂN VẬT:
- Một nhân vật xưng "tôi/anh", tự tin, lầy, hài duyên — KHÔNG nhạt, KHÔNG xàm.
- Bám PERSONA & câu chuyện gốc (đọc STORY CONTEXT): tay câu tự nhận là nhanh nhất vùng biển, cố tình đi câu giữa trưa cho khác người, rồi cá lên liên tục như trúng số.

LUẬT VIẾT CÂU (BẮT BUỘC):
- MỖI beat là MỘT CÂU TIẾNG VIỆT HOÀN CHỈNH, tự nhiên, có chủ-vị, dài 8–14 từ, KẾT bằng dấu câu (. ! ?). Có thể dùng dấu phẩy giữa câu.
- TUYỆT ĐỐI KHÔNG cắt vụn 2–6 từ rời rạc, KHÔNG để câu cụt thiếu nghĩa, KHÔNG word-salad.
- Gộp nhiều câu gốc gần nhau thành MỘT câu Việt mượt nếu hợp lý; bám ý gốc, KHÔNG bịa tình tiết mới.

HUMOR REACTION LAYER (BẮT BUỘC, vừa phải):
- Thêm 3–5 phản ứng vui bằng cách GHÉP cụm cảm thán vào ĐẦU câu money-shot (ưu tiên), CHỈ dùng whitelist: "Ha ha," / "He he," / "Ơ kìa," / "Trời ơi," / "Đúng bài rồi,".
- CHỈ đặt ở money-shot/cao trào THẬT: cá dính câu, cần kéo mạnh, một phát hai con, cá thứ bảy–tám–chín, con to cuối. Reaction phải gắn vào câu CÓ NỘI DUNG (kèm srcIds), KHÔNG đứng một mình vô nghĩa.
- KHÔNG thêm vào mọi beat; KHÔNG lặp một kiểu quá 2 lần; KHÔNG làm câu >16 từ; KHÔNG mất nghĩa gốc/meme; KHÔNG lố/kịch.

MEME/LÓNG TRUNG — GIỮ & VIỆT HÓA (đừng xóa, đừng dịch khô):
- 这片海最快的男人 → "tay câu nhanh nhất cái vùng biển này".
- 跟拔萝卜一样 → "câu cá mà cứ như nhổ củ cải".
- 快到碗里来 → "mau chui vào thùng cho anh nào".
- 葫芦娃救爷爷 / 七娃八娃九娃 / 大娃 → đếm cá kiểu anh em Hồ Lô cho vui: "đứa thứ bảy", "thứ tám lên luôn", "tới đứa thứ chín", con to nhất = "anh cả".
- 清补凉 → "đổi lấy bát chè sâm bổ lượng".
Việt hóa sao cho người Việt hiểu và thấy vui; KHÔNG để lại chữ Hán, KHÔNG lệch cảnh.

CẤU TRÚC:
- Beat đầu role "hook" tại t≈0.5–3s: câu mở "ăn tiền" giới thiệu nhân vật + chốt kèo, đúng luật câu trên.
- Các beat sau role "line" (hoặc "react" cho cảm thán ngắn) bám money-shot.
- Tổng khoảng 18–28 beat cho cả video; KHÔNG nhồi quá dày.

Trả JSON DUY NHẤT: {"beats":[{"t":<giây số>,"role":"hook"|"line"|"react","text":"<câu tiếng Việt>","srcIds":[<id gốc liên quan>]}]}.`;
}

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
interface GptBeat {
  t: number;
  role?: string;
  text: string;
  srcIds?: Array<number | string>; // gpt đôi khi trả "id72" thay vì 72 → coerce
}

/** Chuẩn hóa srcId về SỐ (gpt có thể trả "id72"/"72"/72). null nếu không có. */
function parseSrcId(srcIds: Array<number | string> | undefined): number | undefined {
  if (!Array.isArray(srcIds) || srcIds.length === 0) return undefined;
  const raw = srcIds[0];
  const num = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^0-9]/g, ''));
  return Number.isFinite(num) && num >= 0 ? num : undefined;
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
function hasEndPunct(text: string): boolean {
  return /[.!?…]/.test(text);
}

// Humor Reaction Layer (Caption Style V1 §3) — whitelist cụm phản ứng vui.
const REACTIONS = ['Ha ha,', 'He he,', 'Ơ kìa,', 'Trời ơi,', 'Đúng bài rồi,'] as const;
/** Cụm reaction whitelist mà câu MỞ ĐẦU bằng (case-insensitive), hoặc null. */
function reactionPrefix(text: string): string | null {
  const low = text.trimStart().toLowerCase();
  for (const r of REACTIONS) if (low.startsWith(r.toLowerCase())) return r;
  return null;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { id: { type: 'string' }, model: { type: 'string' }, force: { type: 'boolean' } },
    strict: true,
  });
  const id = values.id;
  if (!id) {
    console.error('Usage: --id <slug> [--model gpt-5.5] [--force]');
    process.exit(1);
  }
  const scriptModel = values.model ?? 'gpt-5.5';
  const force = values.force === true;
  const dir = workDir(id);
  const clipDir = join(dir, 'montage_v2');
  const scriptPath = join(clipDir, 'montage_v2_script.json');

  // EDIT-LOCK: produce re-run 13 KHÔNG được ghi đè bản Operator đã sửa tay.
  if (!force && existsSync(scriptPath)) {
    try {
      const existing = JSON.parse(readFileSync(scriptPath, 'utf8')) as { reviewStatus?: string };
      if (existing.reviewStatus === 'OPERATOR_EDITED') {
        console.log(
          '[13] reviewStatus=OPERATOR_EDITED → GIỮ script Operator sửa tay (skip regeneration). Dùng --force để ép sinh lại.',
        );
        return;
      }
    } catch {
      /* parse lỗi → coi như chưa có, sinh lại */
    }
  }

  // niche → subject (đối tượng câu) để KHÔNG hardcode 1 loài. Manifest thiếu → suy từ id.
  let niche: string | undefined;
  try {
    niche = (JSON.parse(readFileSync(join(dir, 'ent_job.json'), 'utf8')) as { niche?: string })
      .niche;
  } catch {
    /* manifest optional */
  }
  const subject = subjectForNiche(niche, id);

  const meta = JSON.parse(readFileSync(join(dir, 'source_meta.json'), 'utf8')) as {
    durationSec: number;
  };
  const asr = JSON.parse(readFileSync(join(dir, 'asr_zh.json'), 'utf8')) as {
    segments: AsrSegment[];
  };
  // VISION object-truth: "what" từ catch_moments (đối tượng THẬT) → gọi đúng loài.
  const visionWhat: string[] = [];
  try {
    const cm = JSON.parse(readFileSync(join(dir, 'catch_moments.json'), 'utf8')) as {
      moments?: Array<{ what?: string }>;
    };
    for (const m of cm.moments ?? []) {
      const w = (m.what ?? '').trim();
      if (w && !visionWhat.includes(w)) visionWhat.push(w);
    }
  } catch {
    /* catch_moments optional */
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
  // sceneIdx theo montage time (cho span/QA của step 12).
  const sceneAt = (t: number): number | undefined => {
    for (const s of segs) {
      if (t >= s.montageStart && t < s.montageStart + s.dur) return s.idx >= 1 ? s.idx : undefined;
    }
    return undefined;
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

  // B-light: STORY CONTEXT = lời gốc TRƯỚC cửa sổ money-shot đầu tiên (persona/setup,
  // KHÔNG lên hình) → cho GPT hiểu nhân vật & mạch chuyện để viết hook + giọng.
  const firstWindowStart = segs.length > 0 ? Math.min(...segs.map((s) => s.srcStart)) : 0;
  const introLines = asr.segments
    .filter((a) => a.end <= firstWindowStart && a.text.trim())
    .map((a) => a.text.trim());

  // 2) ONE gpt-5.5 call: storytelling VO (full sentences + memes), anchored to money-shots.
  console.log(
    `[13] ${scriptModel} viết VO kể chuyện: intro ${introLines.length} câu (context) + ${srcLines.length} câu trong cảnh…`,
  );
  const out = await chatJson<{ beats?: GptBeat[] }>(apiKey, {
    model: scriptModel,
    system: buildScriptSys(subject),
    user: [
      `Montage câu ${subject} ngoài biển, dài ${Math.round(montageTotal)}s, có ${segs.length - 1} cú ${subject} lên (money-shot).`,
      visionWhat.length > 0
        ? `ĐỐI TƯỢNG THẬT (vision — gọi đúng, KHÔNG đổi loài): ${visionWhat.slice(0, 6).join(' | ')}`
        : `ĐỐI TƯỢNG THẬT: ${subject}.`,
      `Money-shot rơi vào các giây (montage time): ${segs
        .filter((s) => s.idx >= 1)
        .map((s) => Math.round(msMontage(s.idx)))
        .join(', ')}.`,
      '',
      'STORY CONTEXT — lời gốc phần MỞ ĐẦU (KHÔNG lên hình, chỉ để hiểu nhân vật/chuyện, đừng đọc nguyên văn):',
      introLines.length > 0 ? introLines.join(' / ') : '(không có)',
      '',
      'LỜI GỐC TRONG CẢNH (bám ý, anchor theo t; gộp thành câu đủ, giữ/Việt hóa meme):',
      ...srcLines.map((l) => `[t=${l.mStart}s | id${l.id}] ${l.zh}`),
      '',
      `Yêu cầu: ~18–28 beat, mỗi beat 1 câu 8–14 từ có dấu câu, mở bằng hook persona ở t≈1s, THÊM 3–5 reaction whitelist ("Ha ha,"/"He he,"/"Ơ kìa,"/"Trời ơi,"/"Đúng bài rồi,") ghép đầu câu ở money-shot. Trả JSON {"beats":[...]}.`,
    ].join('\n'),
    temperature: 0.8,
  });

  // 3) Build step-12 beats từ GPT output (clamp t, estSec, sceneIdx, srcId).
  const raw = (out.beats ?? []).filter((b) => b && typeof b.text === 'string' && b.text.trim());
  const beats: Beat[] = raw.map((b) => {
    const t = Math.max(0.3, Math.min(montageTotal - 0.5, Number(b.t) || 0.5));
    const text = b.text.trim();
    return {
      role: b.role === 'hook' || b.role === 'react' ? b.role : 'line',
      sceneIdx: sceneAt(t),
      text,
      montageTime: Number(t.toFixed(2)),
      estSec: estRead(text),
      srcId: parseSrcId(b.srcIds),
    };
  });
  beats.sort((a, b) => a.montageTime - b.montageTime);
  // Min spacing nhẹ (dedupe; step 12 mới là nơi anti-overlap theo audio thật).
  const MIN_GAP = 1.0;
  for (let i = 1; i < beats.length; i += 1) {
    const prev = beats[i - 1];
    const cur = beats[i];
    if (!prev || !cur) continue;
    if (cur.montageTime < prev.montageTime + MIN_GAP) {
      cur.montageTime = Number(Math.min(montageTotal - 0.3, prev.montageTime + MIN_GAP).toFixed(2));
    }
  }

  // 4) QA GATE (E) — fail thật khi script cụt/xàm/lủng củng. Không fake pass.
  const n = beats.length;
  const words = beats.map((b) => wordCount(b.text));
  const avgWords = n > 0 ? Number((words.reduce((s, w) => s + w, 0) / n).toFixed(1)) : 0;
  const shortBeats = beats.filter((b, i) => (words[i] ?? 0) < 5 && b.role !== 'react');
  const shortRatio = n > 0 ? Number((shortBeats.length / n).toFixed(2)) : 1;
  const punctBeats = beats.filter((b) => hasEndPunct(b.text));
  const punctRatio = n > 0 ? Number((punctBeats.length / n).toFixed(2)) : 0;
  const longBeats = beats.filter((_, i) => (words[i] ?? 0) > 16);
  const fillerBeats = beats.filter((b) => b.srcId == null && b.role !== 'hook');
  const hookBeat = beats.find((b) => b.role === 'hook' && b.montageTime <= 5);
  // nonsense (cấu trúc): câu KHÔNG phải cảm thán/hook, <4 từ và KHÔNG có dấu câu → nghi cụt.
  const suspect = beats.filter(
    (b, i) => b.role === 'line' && (words[i] ?? 0) < 4 && !hasEndPunct(b.text),
  );
  const totalSpeech = Number(beats.reduce((s, b) => s + b.estSec, 0).toFixed(1));

  // Humor Reaction Layer QA: beat (không phải hook) mở đầu bằng cụm whitelist.
  const moneyShotTimes = segs.filter((s) => s.idx >= 1).map((s) => msMontage(s.idx));
  const reactionBeats = beats.filter((b) => b.role !== 'hook' && reactionPrefix(b.text) != null);
  const reactionCount = reactionBeats.length;
  const REACT_NEAR = 7; // s — reaction phải gần 1 money-shot (cao trào thật)
  const reactMisplaced = reactionBeats.filter(
    (b) =>
      b.srcId == null || !moneyShotTimes.some((mt) => Math.abs(b.montageTime - mt) <= REACT_NEAR),
  );
  const prefixCounts = new Map<string, number>();
  for (const b of reactionBeats) {
    const p = reactionPrefix(b.text) ?? '';
    prefixCounts.set(p, (prefixCounts.get(p) ?? 0) + 1);
  }
  const maxSamePrefix = prefixCounts.size > 0 ? Math.max(...prefixCounts.values()) : 0;
  const minReact = Math.min(3, moneyShotTimes.length);
  const hookWords = hookBeat ? wordCount(hookBeat.text) : 0;

  const gates: Array<{ ok: boolean; label: string }> = [
    { ok: n >= 14 && n <= 34, label: `Số beat ${n} trong [14,34]` },
    { ok: avgWords >= 7, label: `TB từ/beat ${avgWords} ≥ 7` },
    { ok: shortRatio <= 0.3, label: `Tỷ lệ câu <5 từ ${shortRatio} ≤ 0.30` },
    { ok: punctRatio >= 0.65, label: `Tỷ lệ câu có dấu câu ${punctRatio} ≥ 0.65` },
    { ok: longBeats.length <= 1, label: `Câu >16 từ ${longBeats.length} ≤ 1` },
    { ok: fillerBeats.length <= 4, label: `Filler không bám gốc ${fillerBeats.length} ≤ 4` },
    { ok: !!hookBeat && hookWords >= 8, label: `Hook persona ${hookWords} từ (≥8)` },
    { ok: suspect.length === 0, label: `Câu cụt nghi vô nghĩa ${suspect.length} = 0` },
    { ok: reactionCount <= 5, label: `Reaction ${reactionCount} ≤ 5 (không lạm dụng)` },
    {
      ok: reactionCount >= minReact,
      label: `Reaction ${reactionCount} ≥ ${minReact} (đủ Humor Layer)`,
    },
    {
      ok: reactMisplaced.length === 0,
      label: `Reaction đúng money-shot+có nội dung ${reactionCount - reactMisplaced.length}/${reactionCount}`,
    },
    { ok: maxSamePrefix <= 2, label: `Lặp 1 kiểu reaction ≤ 2 (max ${maxSamePrefix})` },
    {
      ok: totalSpeech <= montageTotal,
      label: `Tổng đọc ${totalSpeech}s ≤ ${montageTotal.toFixed(0)}s`,
    },
  ];
  const failed = gates.filter((g) => !g.ok);

  // 5) Write step-12-compatible script JSON (overwrite) + review .md.
  const anchorsHash = createHash('sha256')
    .update(JSON.stringify(plan.anchors))
    .digest('hex')
    .slice(0, 16);
  const boundCount = beats.filter((b) => b.srcId != null).length;
  const scriptJson = {
    videoId: id,
    montageTotalSec: Number(montageTotal.toFixed(1)),
    reviewStatus: 'AUTO', // EDIT-LOCK: Operator đổi thành OPERATOR_EDITED để khóa
    anchorsHash,
    subject,
    scriptModel,
    sourceBound: true,
    storyMode: true,
    chunkCount: beats.length,
    boundChunks: boundCount,
    microChunks: fillerBeats.length,
    reactionCount,
    avgWordsPerBeat: avgWords,
    punctRatio,
    estTotalSpeechSec: totalSpeech,
    qaPass: failed.length === 0,
    beats,
  };
  writeFileSync(scriptPath, JSON.stringify(scriptJson, null, 2));

  const md: string[] = [];
  md.push('# Script review — SOURCE-BOUND v2 (kể chuyện, ⛔ CHỜ DUYỆT)');
  md.push('');
  md.push(
    `- Video: ${id} | tổng ${montageTotal.toFixed(1)}s | bám ASR + persona gốc, câu đủ + dấu câu`,
  );
  md.push(
    `- Model: ${scriptModel} | nguồn: ASR Trung (intro ${introLines.length} câu context + ${srcLines.length} câu trong cảnh). OCR hardsub: chỉ box (scrub), chưa trích text.`,
  );
  md.push(
    `- Beat: **${beats.length}** | TB **${avgWords}** từ/beat | dấu câu **${Math.round(punctRatio * 100)}%** | đọc ~${totalSpeech}s/${montageTotal.toFixed(1)}s`,
  );
  md.push('');
  md.push('## SOURCE TRANSCRIPT trong cảnh (theo montage time)');
  for (const l of srcLines) md.push(`- [${tc(l.mStart)}] (id${l.id}, cú ${l.sceneIdx}) ${l.zh}`);
  md.push('');
  md.push('## VOICEOVER mới (caption = ĐÚNG text này)');
  md.push('| # | time | role | ~đọc | từ | text |');
  md.push('|---|---|---|---|---|---|');
  for (const [i, b] of beats.entries()) {
    md.push(
      `| ${i + 1} | ${tc(b.montageTime)} | ${b.role} | ${b.estSec}s | ${wordCount(b.text)} | ${b.text.replace(/\|/g, '/')} |`,
    );
  }
  md.push('');
  md.push('## QA GATE (E)');
  for (const g of gates) md.push(`- ${g.ok ? '✅' : '🛑'} ${g.label}`);
  md.push('');
  md.push(`> Kết quả QA: ${failed.length === 0 ? '✅ PASS' : `🛑 FAIL (${failed.length} cổng)`}`);
  md.push(
    '> ⛔ Duyệt: sửa `text` trong `montage_v2_script.json` nếu cần, rồi báo "duyệt script" để voice + render.',
  );
  writeFileSync(join(clipDir, 'montage_v2_script_review.md'), md.join('\n'));

  console.log('------------------------------------------------------');
  console.log(
    `[13] VO kể chuyện — ${beats.length} beat | TB ${avgWords} từ | dấu câu ${Math.round(punctRatio * 100)}% | đọc ~${totalSpeech}s`,
  );
  for (const g of gates) console.log(`     ${g.ok ? '✅' : '🛑'} ${g.label}`);
  if (failed.length > 0) {
    console.error(
      `🛑 SCRIPT_QA_FAILED — ${failed.length} cổng QA fail (xem trên). Không báo pass giả.`,
    );
    process.exit(5);
  }
  console.log('[13] ✅ QA PASS — chờ Operator duyệt nội dung chữ (chưa voice/render).');
  console.log('------------------------------------------------------');
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
