// E1 step 13 — SOURCE-BOUND script (CONTENT GATE) — v2 storytelling.
// Binds to the ORIGINAL narration but writes a COHESIVE, FUNNY Vietnamese VO:
//   - reads the intro ASR (id0..firstWindow) as STORY CONTEXT (persona/jokes)
//     even though the montage only shows money-shots (B-light);
//   - ONE gpt-5.5 call writes FULL SENTENCES (8–14 words, real punctuation) —
//     no more 2–6 word fragments (C); keeps + localizes Chinese memes/slang (D);
//   - a hard QA gate fails on choppy/punct-poor/filler-heavy/hook-less output (E);
//   - a bounded SELF-REPAIR loop re-prompts gpt-5.5 with the failed gates +
//     previous beats (lower temp) up to MAX_ATTEMPTS — KHÔNG nới QA, KHÔNG fake pass.
// Output OVERWRITES montage_v2_script.json (step 12 voices/renders it as-is after
// approval) + writes source_cut_reference.json + a human review .md.
// STOPS — no voice, no render. API: 1–MAX_ATTEMPTS gpt-5.5 text calls (no Whisper/vision).
//   pnpm tsx scripts/ent-vlog/13-source-bound.ts --id ent_squid_001 --model gpt-5.5
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { readAnchorPlan } from './lib/anchors.js';
import { requireOpenAIKey, workDir } from './lib/env.js';
import {
  type HookStyle,
  appendHookHistory,
  buildHookStyleBlock,
  isHookRepeat,
  pickHookStyle,
  readHookHistory,
} from './lib/hook-style-bank.js';
import { type AsrSegment, chatJson } from './lib/openai.js';
import { buildStorySegments, isStoryEngine } from './lib/story-arc.js';

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

BẢN ĐỊA HÓA THEO BỐI CẢNH (LUẬT CỨNG — chống dịch máy):
- Bạn là CHUYÊN GIA BẢN ĐỊA HÓA: PHẢI hiệu chỉnh từ vựng theo bối cảnh THẬT của video (nhìn VISION/BỐI CẢNH THẬT + đọc lời gốc), TUYỆT ĐỐI KHÔNG dịch word-by-word.
- Xác định VÙNG NƯỚC trước khi viết: biển / hồ / sông / suối / ao — suy từ VISION (bờ đất, thuyền nhỏ, nước đục, loài cá nước ngọt như chép/trắm/rô…) và lời gốc. KHÔNG mặc định là biển.
- 海/大海 trong lời gốc KHÔNG tự động = "biển": bối cảnh nước ngọt thì phải nói "hồ/sông/vùng nước này". Loài cá nước ngọt mà kể "ngoài biển" là SAI NGỮ CẢNH — cấm.
- Nguyên tắc: nghĩa đúng bối cảnh > chữ đúng mặt chữ.

GIỌNG & NHÂN VẬT:
- Một nhân vật xưng "tôi/anh", tự tin, lầy, hài duyên — KHÔNG nhạt, KHÔNG xàm.
- Bám PERSONA & câu chuyện gốc (đọc STORY CONTEXT của CHÍNH video này): rút cách tự xưng, kiểu chém gió, mục tiêu buổi câu từ lời gốc — mỗi video một persona riêng, KHÔNG bê persona của video khác vào.

LUẬT VIẾT CÂU (BẮT BUỘC):
- MỖI beat là MỘT CÂU TIẾNG VIỆT HOÀN CHỈNH, tự nhiên, có chủ-vị, dài 8–14 từ, KẾT bằng dấu câu (. ! ?). Có thể dùng dấu phẩy giữa câu.
- TUYỆT ĐỐI KHÔNG cắt vụn 2–6 từ rời rạc, KHÔNG để câu cụt thiếu nghĩa, KHÔNG word-salad.
- Gộp nhiều câu gốc gần nhau thành MỘT câu Việt mượt nếu hợp lý; bám ý gốc, KHÔNG bịa tình tiết mới.

HUMOR REACTION LAYER (BẮT BUỘC, vừa phải):
- Thêm 3–5 phản ứng vui bằng cách GHÉP cụm cảm thán vào ĐẦU câu money-shot (ưu tiên), CHỈ dùng whitelist: "Ha ha," / "He he," / "Ơ kìa," / "Trời ơi," / "Đúng bài rồi,".
- CHỈ đặt ở money-shot/cao trào THẬT: cá dính câu, cần kéo mạnh, một phát hai con, cá thứ bảy–tám–chín, con to cuối. Reaction phải gắn vào câu CÓ NỘI DUNG (kèm srcIds), KHÔNG đứng một mình vô nghĩa.
- KHÔNG thêm vào mọi beat; KHÔNG lặp một kiểu quá 2 lần; KHÔNG làm câu >16 từ; KHÔNG mất nghĩa gốc/meme; KHÔNG lố/kịch.

MEME/LÓNG TRUNG — GIỮ & VIỆT HÓA (đừng xóa, đừng dịch khô):
- 这片海最快的男人 → "tay câu nhanh nhất cái vùng nước này" (thay "vùng nước" bằng biển/hồ/sông ĐÚNG bối cảnh thật).
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

// QA gate (key ổn định + nhãn người đọc). key dùng để map gợi ý sửa khi repair.
interface Gate {
  key: string;
  ok: boolean;
  label: string;
}
// Một lần GPT sinh + build beats + chấm QA → kết quả đầy đủ để chọn bản tốt nhất.
interface Attempt {
  beats: Beat[];
  gates: Gate[];
  failed: Gate[];
  avgWords: number;
  punctRatio: number;
  totalSpeech: number;
  reactionCount: number;
  fillerCount: number;
  hookBeat: Beat | undefined;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { id: { type: 'string' }, model: { type: 'string' }, force: { type: 'boolean' } },
    strict: true,
  });
  const idArg = values.id;
  if (!idArg) {
    console.error('Usage: --id <slug> [--model gpt-5.5] [--force]');
    process.exit(1);
  }
  const id: string = idArg; // narrow string để closure runAttempt() bắt được (const giữ type)
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
  // STORY engine (opt-in) → segs theo act; mặc định anchors cũ.
  const plan = readAnchorPlan(dir);
  const story = isStoryEngine(dir, id);
  let segs: Array<{
    idx: number;
    tSec: number;
    srcStart: number;
    srcEnd: number;
    dur: number;
    montageStart: number;
  }>;
  let montageTotal: number;
  let storyConf = '';
  const storyRoleByIdx = new Map<number, string>();
  if (story) {
    const sb = buildStorySegments(dir, id);
    segs = sb.segs.map((s) => ({
      idx: s.idx,
      tSec: s.tSec,
      srcStart: s.srcStart,
      srcEnd: s.srcEnd,
      dur: s.dur,
      montageStart: s.montageStart,
    }));
    montageTotal = sb.montageTotalSec;
    storyConf = sb.story_confidence;
    for (const s of sb.segs) storyRoleByIdx.set(s.idx, s.role);
    console.log(`[13] STORY mode (conf ${storyConf}) — ${segs.length} act-segs, ${montageTotal}s`);
  } else {
    let running = 0;
    segs = [...plan.anchors]
      .sort((a, b) => a - b)
      .map((tSec, idx) => {
        const srcStart = Math.max(0, tSec - plan.lead);
        const srcEnd = Math.min(meta.durationSec, tSec + plan.reaction);
        const dur = srcEnd - srcStart;
        const montageStart = running;
        running += dur;
        return { idx, tSec, srcStart, srcEnd, dur, montageStart };
      });
    montageTotal = running;
  }
  const msMontage = (idx: number): number => {
    const s = segs[idx];
    return s ? s.montageStart + (s.tSec - s.srcStart) : 0;
  };
  // RV1.5 hook: 1–2 lát money-shot chèn đầu (role teaser). teaserDur = TỔNG độ dài
  // hook = montageStart của seg story đầu tiên → chừa cả [0..hookDur] khỏi VO/caption.
  const teaserDur = story
    ? (segs.find((s) => storyRoleByIdx.get(s.idx) !== 'teaser')?.montageStart ?? 0)
    : 0;
  // money-shot (cú cá lên) — story: mọi seg TRỪ teaser & setup; anchor: idx>=1 (như cũ).
  const isMS = (s: { idx: number }): boolean => {
    if (!story) return s.idx >= 1;
    const r = storyRoleByIdx.get(s.idx);
    return r !== 'teaser' && r !== 'setup';
  };
  // sceneIdx theo montage time (cho span/QA của step 12).
  const sceneAt = (t: number): number | undefined => {
    for (const s of segs) {
      if (t >= s.montageStart && t < s.montageStart + s.dur) return isMS(s) ? s.idx : undefined;
    }
    return undefined;
  };

  // 1) SOURCE CUT REFERENCE: slice ASR into each window, map to montage time.
  const srcLines: SrcLine[] = [];
  for (const seg of segs) {
    if (storyRoleByIdx.get(seg.idx) === 'teaser') continue; // teaser = lát lặp climax, không map lời
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
  // Reaction chỉ hợp lệ khi GẦN money-shot (QA: REACT_NEAR=7s). Với teaser/setup đẩy
  // money-shot đầu ra xa, cấm gpt đặt reaction trong đoạn setup mở đầu → khớp gate.
  const msTimesSorted = segs
    .filter((s) => isMS(s))
    .map((s) => msMontage(s.idx))
    .sort((a, b) => a - b);
  const reactFloor = Math.max(0, Math.floor((msTimesSorted[0] ?? 0) - 3));

  // HOOK STYLE BANK: chọn GIỌNG hook cho job (xoay vòng, né style + hook của job gần)
  // → hook nghe như người thật, KHÔNG lặp 1 câu mẫu khi scale nhiều clip/kênh.
  const hookHistory = readHookHistory(dir);
  const hookStyle: HookStyle = pickHookStyle(id, hookHistory);
  const recentHooks = hookHistory
    .filter((e) => e.jobId !== id)
    .slice(-3)
    .map((e) => e.hookText);
  console.log(
    `[13] HOOK STYLE = "${hookStyle.label}" (${hookStyle.id}); né ${recentHooks.length} hook gần đây.`,
  );

  // Số beat gợi ý scale theo thời lượng montage (calibrate gốc: 60s → 14–18 beat).
  // Trần cut đã nâng lên ~87s cho FB Reels → beat phải giãn theo, kẹp trong QA gate
  // beatCount [14,34]; giữ mật độ đọc ~như cũ để voice không thưa cũng không tràn.
  const beatLo = Math.max(14, Math.round(montageTotal * 0.23));
  const beatHi = Math.min(30, Math.max(18, Math.round(montageTotal * 0.3)));

  // 2) Prompt nền (lần sinh đầu). Self-repair sẽ nối thêm khối "sửa cổng fail" vào sau.
  const baseUser = (
    story
      ? [
          `Đây là VIDEO KỂ CHUYỆN câu ${subject}, dài ${Math.round(montageTotal)}s, dựng theo MẠCH: setup → buildup → escalation → climax → resolution. VÙNG NƯỚC (biển/hồ/sông/suối): TỰ XÁC ĐỊNH từ BỐI CẢNH THẬT + lời gốc bên dưới — KHÔNG mặc định biển.`,
          visionWhat.length > 0
            ? `BỐI CẢNH THẬT (vision từng money-shot — dùng để chọn đúng vùng nước + gọi đúng loài): ${visionWhat.slice(0, 6).join(' | ')}`
            : `ĐỐI TƯỢNG THẬT: ${subject}.`,
          `Các đoạn (montage time → vai): ${segs
            .filter((s) => storyRoleByIdx.get(s.idx) !== 'teaser')
            .map((s) => `${Math.round(s.montageStart)}s ${storyRoleByIdx.get(s.idx) ?? 'catch'}`)
            .join(' | ')}.`,
          visionWhat.length > 0
            ? `ĐỐI TƯỢNG THẬT (vision — gọi đúng, KHÔNG đổi loài): ${visionWhat.slice(0, 6).join(' | ')}`
            : `ĐỐI TƯỢNG THẬT: ${subject}.`,
          buildHookStyleBlock(hookStyle, recentHooks),
          `Sau hook (t≥${(teaserDur + 0.5).toFixed(1)}s) MỚI vào STORY: mở bằng câu persona setup, rồi buildup → escalation → climax (con TO NHẤT) → resolution. Kết 1 câu CTA mềm ("Theo dõi xem buổi sau…") ở resolution.`,
          storyConf === 'high'
            ? 'story_confidence=high → được kể đậm persona (VẪN bám lời gốc).'
            : `⚠ story_confidence=${storyConf} → viết DÈ DẶT: CHỈ dùng điều CÓ trong lời gốc, TUYỆT ĐỐI KHÔNG bịa persona/hành trình.`,
          '',
          'LỜI GỐC TỪNG ĐOẠN (theo montage time — Việt hóa TRUNG THỰC, giữ/Việt hóa meme, KHÔNG bịa):',
          ...srcLines.map((l) => `[t=${l.mStart}s | id${l.id}] ${l.zh}`),
          '',
          `Yêu cầu: ${beatLo}–${beatHi} beat, mỗi câu 8–13 từ có dấu câu, TỔNG đọc ≤ ${Math.max(20, Math.round(montageTotal - 9))}s (thà ít/gọn hơn voice tràn). 3–4 reaction whitelist ("Ha ha,"/"He he,"/"Ơ kìa,"/"Trời ơi,"/"Đúng bài rồi,") — CHỈ ghép Ở CẢNH CÁ LÊN (money-shot, t ≥ ${reactFloor}s); TUYỆT ĐỐI KHÔNG đặt reaction trong đoạn setup/persona mở đầu (giữ setup là lời kể nhân vật, không reo). Trả JSON {"beats":[...]}.`,
        ]
      : [
          `Montage câu ${subject}, dài ${Math.round(montageTotal)}s, có ${segs.length - 1} cú ${subject} lên (money-shot). VÙNG NƯỚC (biển/hồ/sông/suối): tự xác định từ ĐỐI TƯỢNG THẬT + lời gốc — KHÔNG mặc định biển.`,
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
        ]
  ).join('\n');

  // Gợi ý sửa theo TỪNG cổng (key ổn định, không phụ thuộc con số trong label).
  // Self-repair feed đúng gợi ý của cổng đang fail → GPT sửa trúng chỗ, không xáo trộn cả bài.
  const REPAIR_HINTS: Record<string, string> = {
    beatCount: 'Số beat phải nằm trong [14,34]: thêm/bớt beat cho đúng khoảng.',
    avgWords: 'Câu quá ngắn: viết câu đủ chủ-vị 8–14 từ, trung bình ≥7 từ/beat.',
    shortRatio: 'Quá nhiều câu <5 từ: gộp lại thành câu hoàn chỉnh, bỏ câu cụt.',
    punctRatio: 'Thiếu dấu câu: MỖI beat phải kết bằng . ! hoặc ? (≥65% beat).',
    longBeats: 'Có câu >16 từ: tách hoặc rút gọn xuống ≤16 từ.',
    filler: 'Quá nhiều beat không bám lời gốc: mỗi "line" phải kèm srcIds id gốc liên quan.',
    hookMin: 'Hook quá ngắn: viết hook ≥8 từ, giới thiệu nhân vật + chốt kèo.',
    hookMax: 'Hook quá dài: rút hook xuống ≤13 từ mà vẫn ăn tiền.',
    hookDiversity:
      'Hook bị lặp mô-típ/đụng hook job gần: viết hook MỚI theo đúng style đã chỉ định, đừng dùng mô-típ "con đầu đã vậy…".',
    suspect: 'Có câu cụt vô nghĩa: bỏ hoặc viết lại thành câu đủ nghĩa.',
    reactMax: 'Quá 5 reaction: giảm còn ≤5 cụm cảm thán.',
    reactMin:
      'Thiếu reaction: thêm cụm whitelist ("Ha ha,"/"He he,"/"Ơ kìa,"/"Trời ơi,"/"Đúng bài rồi,") ghép đầu câu money-shot cho đủ.',
    reactMisplaced:
      'Reaction sai chỗ: CHỈ ghép cụm cảm thán vào câu money-shot CÓ srcIds, bám sát cú cá lên gần nhất.',
    reactRepeat: 'Lặp 1 kiểu reaction quá 2 lần: đa dạng cụm cảm thán.',
    totalSpeech: 'Đọc tràn video: cắt bớt/viết gọn để tổng đọc ≤ tổng độ dài video.',
  };
  // Repair prompt = baseUser + cổng fail + gợi ý + BẢN TRƯỚC để GPT sửa từ đó (không viết lại từ đầu).
  function buildRepairUser(prev: Attempt): string {
    const failHints = prev.failed.map(
      (g) => `- 🛑 ${g.label} → ${REPAIR_HINTS[g.key] ?? 'sửa cho đạt cổng này.'}`,
    );
    const prevBeats = prev.beats.map(
      (b, i) =>
        `${i + 1}. [${b.role} t=${b.montageTime}s${b.srcId != null ? ` id${b.srcId}` : ''}] ${b.text}`,
    );
    return [
      baseUser,
      '',
      '⚠️ BẢN TRƯỚC TRƯỢT QA — SỬA LẠI: GIỮ các câu đã ổn, chỉ chỉnh đúng cổng fail dưới đây (đừng viết lại từ đầu nếu không cần):',
      ...failHints,
      '',
      'Bản VO trước (sửa từ đây):',
      ...prevBeats,
      '',
      'Trả lại JSON {"beats":[...]} đã sửa.',
    ].join('\n');
  }

  // Một lần sinh: gọi GPT → build beats (clamp t/estSec/sceneIdx/srcId) → chấm 15 cổng QA.
  async function runAttempt(userPrompt: string, temperature: number): Promise<Attempt> {
    const out = await chatJson<{ beats?: GptBeat[] }>(apiKey, {
      model: scriptModel,
      system: buildScriptSys(subject),
      user: userPrompt,
      temperature,
    });

    // 3) Build step-12 beats từ GPT output (clamp t, estSec, sceneIdx, srcId).
    const raw = (out.beats ?? []).filter((b) => b && typeof b.text === 'string' && b.text.trim());
    const voFloor = story ? Number((teaserDur + 0.2).toFixed(2)) : 0.3; // story khác → đọc đè hook
    const beats: Beat[] = raw.map((b) => {
      const role = b.role === 'hook' || b.role === 'react' ? b.role : 'line';
      const gptT = Number(b.t);
      // Cold-open hook line: ÉP mọi beat role 'hook' của story về slot 0.3–1.2s (voice
      // xuất hiện TRƯỚC 1.5s, bất kể GPT đặt t đâu — đảm bảo hook luôn có lời sớm). Beat
      // story khác → clamp ≥ voFloor (sau hook hình). Anchor (non-story) → giữ như cũ.
      const isColdOpen = story && role === 'hook';
      const lo = isColdOpen ? 0.3 : voFloor;
      const hi = isColdOpen ? Math.min(1.2, montageTotal - 0.5) : montageTotal - 0.5;
      const t = isColdOpen
        ? Math.min(hi, Math.max(lo, Number.isFinite(gptT) && gptT < teaserDur ? gptT : 0.6))
        : Math.max(lo, Math.min(hi, Number.isFinite(gptT) ? gptT : lo + 0.2));
      const text = b.text.trim();
      return {
        role,
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
        cur.montageTime = Number(
          Math.min(montageTotal - 0.3, prev.montageTime + MIN_GAP).toFixed(2),
        );
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
    // Hook persona = beat narration ĐẦU TIÊN, ngay sau hook hình (VO bắt đầu ở teaserDur).
    const hookBeat = beats.find((b) => b.role === 'hook' && b.montageTime <= teaserDur + 5);
    // nonsense (cấu trúc): câu KHÔNG phải cảm thán/hook, <4 từ và KHÔNG có dấu câu → nghi cụt.
    const suspect = beats.filter(
      (b, i) => b.role === 'line' && (words[i] ?? 0) < 4 && !hasEndPunct(b.text),
    );
    const totalSpeech = Number(beats.reduce((s, b) => s + b.estSec, 0).toFixed(1));

    // Humor Reaction Layer QA: beat (không phải hook) mở đầu bằng cụm whitelist.
    const moneyShotTimes = segs.filter((s) => isMS(s)).map((s) => msMontage(s.idx));
    const reactionBeats = beats.filter((b) => b.role !== 'hook' && reactionPrefix(b.text) != null);
    const reactionCount = reactionBeats.length;
    // REACT_NEAR động: floor 7s (calibrate cut ~60s), tự giãn theo NỬA khoảng cách
    // lớn nhất giữa 2 money-shot kề nhau — diệt "khe chết" khi budget 87s (FB Reels)
    // kéo các cú cách nhau 15–16s (>2×7) khiến vị trí reaction hợp lệ không phủ kín trục thời gian.
    const msSorted = [...moneyShotTimes].sort((a, b) => a - b);
    const maxGap = msSorted.reduce(
      (g, t, i) => (i > 0 ? Math.max(g, t - (msSorted[i - 1] ?? t)) : g),
      0,
    );
    const REACT_NEAR = Math.max(7, Math.ceil(maxGap / 2)); // s — reaction phải gần 1 money-shot (cao trào thật)
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
    // Chống lặp hook: dính mô-típ cấm ("con đầu đã vậy…") hoặc đụng hook job gần → FAIL.
    const hookRep = isHookRepeat(hookBeat?.text ?? '', hookHistory, id);

    const gates: Gate[] = [
      { key: 'beatCount', ok: n >= 14 && n <= 34, label: `Số beat ${n} trong [14,34]` },
      { key: 'avgWords', ok: avgWords >= 7, label: `TB từ/beat ${avgWords} ≥ 7` },
      {
        key: 'shortRatio',
        ok: shortRatio <= 0.3,
        label: `Tỷ lệ câu <5 từ ${shortRatio} ≤ 0.30`,
      },
      {
        key: 'punctRatio',
        ok: punctRatio >= 0.65,
        label: `Tỷ lệ câu có dấu câu ${punctRatio} ≥ 0.65`,
      },
      { key: 'longBeats', ok: longBeats.length <= 1, label: `Câu >16 từ ${longBeats.length} ≤ 1` },
      {
        key: 'filler',
        ok: fillerBeats.length <= 4,
        label: `Filler không bám gốc ${fillerBeats.length} ≤ 4`,
      },
      {
        key: 'hookMin',
        ok: !!hookBeat && hookWords >= 8,
        label: `Hook persona ${hookWords} từ (≥8)`,
      },
      {
        key: 'hookMax',
        ok: !!hookBeat && hookWords <= 13,
        label: `Hook ≤13 từ (${hookWords})`,
      },
      {
        key: 'hookDiversity',
        ok: !hookRep.repeat,
        label: `Hook đa dạng style "${hookStyle.id}"${hookRep.repeat ? ` 🛑 ${hookRep.reason}` : ''}`,
      },
      {
        key: 'suspect',
        ok: suspect.length === 0,
        label: `Câu cụt nghi vô nghĩa ${suspect.length} = 0`,
      },
      {
        key: 'reactMax',
        ok: reactionCount <= 5,
        label: `Reaction ${reactionCount} ≤ 5 (không lạm dụng)`,
      },
      {
        key: 'reactMin',
        ok: reactionCount >= minReact,
        label: `Reaction ${reactionCount} ≥ ${minReact} (đủ Humor Layer)`,
      },
      {
        key: 'reactMisplaced',
        ok: reactMisplaced.length === 0,
        label: `Reaction đúng money-shot+có nội dung ${reactionCount - reactMisplaced.length}/${reactionCount}`,
      },
      {
        key: 'reactRepeat',
        ok: maxSamePrefix <= 2,
        label: `Lặp 1 kiểu reaction ≤ 2 (max ${maxSamePrefix})`,
      },
      {
        key: 'totalSpeech',
        ok: totalSpeech <= montageTotal,
        label: `Tổng đọc ${totalSpeech}s ≤ ${montageTotal.toFixed(0)}s`,
      },
    ];
    const failed = gates.filter((g) => !g.ok);
    return {
      beats,
      gates,
      failed,
      avgWords,
      punctRatio,
      totalSpeech,
      reactionCount,
      fillerCount: fillerBeats.length,
      hookBeat,
    };
  }

  // SELF-REPAIR LOOP — sinh lại tối đa MAX_ATTEMPTS lần, GIỮ NGUYÊN 15 cổng QA.
  // Lần 1: temp 0.8 (đa dạng). Fail → feed cổng trượt + bản trước, temp 0.6 (bám gợi ý sửa).
  // Giữ bản TỐT NHẤT (ít cổng fail nhất); vẫn fail hết lượt → ghi best + exit(5), KHÔNG fake pass.
  const MAX_ATTEMPTS = 4;
  console.log(
    `[13] ${scriptModel} viết VO kể chuyện: intro ${introLines.length} câu (context) + ${srcLines.length} câu trong cảnh… (tối đa ${MAX_ATTEMPTS} lần)`,
  );
  let best: Attempt | null = null;
  let attempts = 0;
  let bestAttemptNo = 0;
  for (let attemptNo = 1; attemptNo <= MAX_ATTEMPTS; attemptNo += 1) {
    attempts = attemptNo;
    let userPrompt = baseUser;
    let temperature = 0.8;
    if (attemptNo > 1 && best != null) {
      userPrompt = buildRepairUser(best);
      temperature = 0.6;
      console.log(
        `[13] 🔧 Repair ${attemptNo}/${MAX_ATTEMPTS} — sửa ${best.failed.length} cổng QA (temp ${temperature})…`,
      );
    }
    const attempt = await runAttempt(userPrompt, temperature);
    if (best == null || attempt.failed.length < best.failed.length) {
      best = attempt;
      bestAttemptNo = attemptNo;
    }
    if (attempt.failed.length === 0) break;
  }
  if (best == null) {
    console.error('🛑 SCRIPT_GEN_FAILED — không sinh được beat nào.');
    process.exit(1);
  }
  const {
    beats,
    gates,
    failed,
    avgWords,
    punctRatio,
    totalSpeech,
    reactionCount,
    fillerCount,
    hookBeat,
  } = best;

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
    microChunks: fillerCount,
    reactionCount,
    avgWordsPerBeat: avgWords,
    punctRatio,
    estTotalSpeechSec: totalSpeech,
    genAttempts: attempts,
    qaPass: failed.length === 0,
    beats,
  };
  writeFileSync(scriptPath, JSON.stringify(scriptJson, null, 2));

  // Hook ĐẠT QA → ghi lịch sử (style + câu) để các job SAU né style gần + né lặp câu.
  if (failed.length === 0 && hookBeat) {
    appendHookHistory(dir, {
      jobId: id,
      styleId: hookStyle.id,
      hookText: hookBeat.text,
      at: new Date().toISOString(),
    });
  }

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
  md.push(
    `- Self-repair: **${attempts}** lần sinh (chọn bản lần **${bestAttemptNo}**) | kết quả ${failed.length === 0 ? '✅ PASS' : `🛑 FAIL ${failed.length} cổng`}`,
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
    `[13] VO kể chuyện — ${beats.length} beat | TB ${avgWords} từ | dấu câu ${Math.round(punctRatio * 100)}% | đọc ~${totalSpeech}s | sinh ${attempts} lần`,
  );
  for (const g of gates) console.log(`     ${g.ok ? '✅' : '🛑'} ${g.label}`);
  if (failed.length > 0) {
    console.error(
      `🛑 SCRIPT_QA_FAILED — ${failed.length} cổng QA fail sau ${attempts} lần sinh (giữ bản tốt nhất lần ${bestAttemptNo}). Không báo pass giả.`,
    );
    process.exit(5);
  }
  console.log(
    `[13] ✅ QA PASS (lần ${bestAttemptNo}/${attempts}) — chờ Operator duyệt nội dung chữ (chưa voice/render).`,
  );
  console.log('------------------------------------------------------');
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
