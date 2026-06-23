// E1 step 11 — FULL continuous script writer (CONTENT GATE).
// Writes ONE flowing Vietnamese entertainment script for the whole montage_v2,
// broken into MANY SHORT chunks (3–8 words) so voice reads fast and captions
// don't crowd the vertical TikTok frame. Each money-shot gets 2–4 beats
// (lead → reveal → punch → link). This is the SINGLE source for both voice AND
// caption. It STOPS here and emits a review file — no voice, no render — until
// the Operator approves the text.
// API budget: 1 vision call (cached after first run) + 1 script call.
//   pnpm tsx scripts/ent-vlog/11-script-write.ts --id ent_squid_001 --model gpt-5.5
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { requireOpenAIKey, workDir } from './lib/env.js';
import { type AsrSegment, chatJson, chatVisionJson } from './lib/openai.js';

const DEFAULT_ANCHORS = [3.5, 136.5, 227.5, 290.5, 346.5];

const VISION_SYS = `Bạn xem các khung MONEY-SHOT của 1 video săn mực trên biển (theo idx).
Trả JSON {"vibe":"<không khí chung 1 câu>","scenes":[{"idx":<number>,"desc":"<cảnh gì, mực thế nào, đang làm gì — cực ngắn>"}]}. KHÔNG bịa.`;

const SCRIPT_SYS = `Bạn là người viết kịch bản voiceover cho VLOG GIẢI TRÍ săn mực/câu cá tiếng Việt (đăng TikTok dọc).
Mục tiêu: MỘT MẠCH liên tục, dồn dập, vui, đời thường, năng lượng tăng dần — KHÔNG lan man, KHÔNG liệt kê khô, có kết nối cảnh này sang cảnh sau (càng câu càng cuốn).

QUAN TRỌNG NHẤT — chia thành NHIỀU CỤM NGẮN để voice đọc nhanh, caption không chật màn hình:
- Mỗi cụm 3–8 từ (tốt nhất). Tối đa 10–12 từ NẾU THẬT CẦN.
- TUYỆT ĐỐI không câu dài lê thê. Một ý lớn phải tách thành 2–3 cụm ngắn liên tiếp.

Cấu trúc:
- hook: 1 cụm ngắn cực mạnh, đúng cảnh mực vừa giơ lên.
- opening: 1–2 cụm ngắn dẫn vào buổi câu.
- mỗi cú mực lên (catches, đúng thứ tự sceneIdx) gồm 2–4 nhịp ngắn, mỗi nhịp có "kind":
   - "lead": nhịp dẫn vào cú đó (0–2 nhịp).
   - "reveal": nhịp thấy mực/cá vừa lên (1 nhịp).
   - "punch": nhịp nhấn cảm xúc/hài đúng lúc (1 nhịp, BẮT BUỘC).
   - "link": nhịp nối sang cú sau (0–1 nhịp).
- closing: 1–2 cụm ngắn kết nhẹ, KHÔNG CTA bán hàng.

Tổng TOÀN VIDEO khoảng 16–18 cụm.
Phong cách: tiếng Việt nói chuyện đời thường, vui, có năng lượng. KHÔNG dịch máy. KHÔNG lặp một kiểu câu. KHÔNG lặp "alien/người ngoài hành tinh" quá 1 lần trong cả video.
Bám cảnh thật (mô tả vision) + lời gốc (ASR) — KHÔNG bịa quá cảnh.
Trả JSON: {"hook":"...","opening":["...","..."],"catches":[{"sceneIdx":<number>,"beats":[{"kind":"lead|reveal|punch|link","text":"..."}]}],"closing":["...","..."]}.`;

type BeatKind = 'lead' | 'reveal' | 'punch' | 'link';

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

/** Estimate edge-tts (vi-VN, +18% rate) read time for a short chunk. Heuristic
 *  only — the real timing comes from the voice word-boundaries at synth time. */
function estRead(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(0.7, Number((words * 0.26 + 0.35).toFixed(2)));
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Evenly spread n anchor times across [t0,t1] (single item → midpoint). */
function spread(n: number, t0: number, t1: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [(t0 + t1) / 2];
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push(t0 + (i / (n - 1)) * (t1 - t0));
  return out;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      id: { type: 'string' },
      lead: { type: 'string' },
      reaction: { type: 'string' },
      model: { type: 'string' },
    },
    strict: true,
  });
  const id = values.id;
  if (!id) {
    console.error('Usage: --id <slug> [--model gpt-5.5]');
    process.exit(1);
  }
  const lead = values.lead ? Number(values.lead) : 14;
  const reaction = values.reaction ? Number(values.reaction) : 9;
  // Vision (scene understanding) stays on gpt-4o; --model overrides only the
  // script writer (prose) call where model quality matters most.
  const scriptModel = values.model ?? 'gpt-4o';

  const dir = workDir(id);
  const meta = JSON.parse(readFileSync(join(dir, 'source_meta.json'), 'utf8')) as {
    path: string;
    durationSec: number;
  };
  const asr = JSON.parse(readFileSync(join(dir, 'asr_zh.json'), 'utf8')) as {
    segments: AsrSegment[];
  };
  const apiKey = requireOpenAIKey();

  // Rebuild the SAME montage segment structure as step 10 (montage_v2 exists).
  let running = 0;
  const segs = DEFAULT_ANCHORS.sort((a, b) => a - b).map((tSec, idx) => {
    const srcStart = Math.max(0, tSec - lead);
    const srcEnd = Math.min(meta.durationSec, tSec + reaction);
    const dur = srcEnd - srcStart;
    const montageStart = running;
    running += dur;
    return { idx, tSec, srcStart, srcEnd, dur, montageStart };
  });
  const montageTotal = running;
  const msMontage = (s: (typeof segs)[number]) => s.montageStart + (s.tSec - s.srcStart);
  const msLabel = (idx?: number): string | null => {
    if (idx == null) return null;
    const s = segs[idx];
    return s ? tc(msMontage(s)) : null;
  };

  // 1) Vision: understand each money-shot. CACHED after first run so script
  //    tweak rounds don't re-call vision (honors the "1 vision call" budget).
  const clipDir = join(dir, 'montage_v2');
  const visDir = join(clipDir, '_vis');
  mkdirSync(visDir, { recursive: true });
  const visCachePath = join(visDir, 'vision_scenes.json');
  let vis: { vibe?: string; scenes?: Array<{ idx: number; desc: string }> };
  if (existsSync(visCachePath)) {
    vis = JSON.parse(readFileSync(visCachePath, 'utf8'));
    console.log('[11] Vision cache hit — bỏ qua vision call.');
  } else {
    const imgs: Array<{ label: string; base64: string }> = [];
    for (const s of segs) {
      const fp = join(visDir, `ms_${s.idx}.jpg`);
      if (!existsSync(fp)) {
        spawnSync(
          'ffmpeg',
          ['-y', '-ss', String(s.tSec), '-i', meta.path, '-frames:v', '1', '-vf', 'scale=512:-1', '-q:v', '5', fp],
          { encoding: 'utf8' },
        );
      }
      if (existsSync(fp))
        imgs.push({ label: `idx=${s.idx}`, base64: readFileSync(fp).toString('base64') });
    }
    console.log(`[11] Vision (1 call) hiểu ${imgs.length} money-shot…`);
    vis = await chatVisionJson<{ vibe?: string; scenes?: Array<{ idx: number; desc: string }> }>(
      apiKey,
      { system: VISION_SYS, userText: 'Mô tả từng money-shot theo idx + không khí chung.', images: imgs },
    );
    writeFileSync(visCachePath, JSON.stringify(vis, null, 2));
  }
  const sceneDesc = new Map((vis.scenes ?? []).map((x) => [x.idx, x.desc]));

  // 2) ONE script call: full continuous script, many SHORT chunks. Catches =
  //    money-shots idx 1..4 (idx 0 = intro shot, covered by hook+opening).
  const catchSegs = segs.filter((s) => s.idx >= 1);
  const asrFor = (s: (typeof segs)[number]) =>
    asr.segments
      .filter((a) => a.end > s.srcStart && a.start < s.srcEnd && a.text.trim())
      .map((a) => a.text.trim())
      .join(' ');
  console.log(`[11] ${scriptModel} viết script (chia cụm ngắn)…`);
  const sc = await chatJson<{
    hook?: string;
    opening?: string[];
    catches?: Array<{ sceneIdx: number; beats: Array<{ kind: BeatKind; text: string }> }>;
    closing?: string[];
  }>(apiKey, {
    model: scriptModel,
    system: SCRIPT_SYS,
    user: [
      `Bối cảnh: ${vis.vibe ?? 'montage săn mực Biển Đông'}. Video dài ${Math.round(montageTotal)}s, ${catchSegs.length} cú mực lên (sau cảnh mở đầu).`,
      'Cần TỔNG khoảng 16–18 cụm ngắn cho cả video. Mỗi cú 3–4 nhịp ngắn.',
      'Ví dụ phong cách tách nhịp (THAM KHẢO, đừng copy y nguyên): "Lên rồi, con đầu tiên!" / "Nhìn thân nó sáng bóng kìa." / "Bụng còn căng nước luôn." / "Lắc một cái là phồng lên!" / "Chưa kịp nghỉ lại có tiếp." / "Con này vừa lên đã xịt nước." / "Thiếu lịch sự quá nha!" / "Càng câu càng thấy đã."',
      ...catchSegs.map(
        (s) =>
          `sceneIdx=${s.idx} | cảnh: ${sceneDesc.get(s.idx) ?? 'mực lên'} | lời gốc: ${asrFor(s) || '(ít/không lời)'}`,
      ),
    ].join('\n'),
    temperature: 0.7,
  });

  // 3) Lay short beats on the montage timeline.
  const beats: Beat[] = [];
  const push = (role: string, text: string, montageTime: number, sceneIdx?: number) => {
    const t = text.trim();
    if (!t) return;
    beats.push({ role, sceneIdx, text: t, montageTime, estSec: estRead(t) });
  };

  const hook = (sc.hook ?? 'Lên rồi, con đầu tiên!').trim();
  push('hook', hook, 0.4);

  const seg0 = segs[0];
  const seg0Dur = seg0?.dur ?? 12.5;
  const opening = (sc.opening ?? ['Ra biển câu mực cho thư giãn.']).slice(0, 2);
  for (const [i, t] of spread(opening.length, 2.6, Math.max(3.4, seg0Dur - 1.0)).entries()) {
    const txt = opening[i];
    if (txt) push('opening', txt, Number(t.toFixed(1)));
  }

  for (const c of sc.catches ?? []) {
    const seg = segs.find((s) => s.idx === c.sceneIdx);
    if (!seg) continue;
    const ms = msMontage(seg);
    const mEnd = seg.montageStart + seg.dur;
    const leads = c.beats.filter((b) => b.kind === 'lead');
    const reveals = c.beats.filter((b) => b.kind === 'reveal');
    const punches = c.beats.filter((b) => b.kind === 'punch');
    const links = c.beats.filter((b) => b.kind === 'link');
    for (const [i, t] of spread(leads.length, seg.montageStart + 1.5, ms - 3.2).entries()) {
      const b = leads[i];
      if (b) push('lead', b.text, Number(t.toFixed(1)), seg.idx);
    }
    for (const [i, t] of spread(reveals.length, ms - 2.4, ms - 1.0).entries()) {
      const b = reveals[i];
      if (b) push('reveal', b.text, Number(t.toFixed(1)), seg.idx);
    }
    for (const [i, t] of spread(punches.length, ms + 0.2, ms + 1.6).entries()) {
      const b = punches[i];
      if (b) push('punch', b.text, Number(t.toFixed(1)), seg.idx);
    }
    for (const [i, t] of spread(links.length, ms + 3.0, mEnd - 0.8).entries()) {
      const b = links[i];
      if (b) push('link', b.text, Number(t.toFixed(1)), seg.idx);
    }
  }

  const closing = (sc.closing ?? ['Một buổi câu quá đã.']).slice(0, 2);
  for (const [i, t] of spread(closing.length, montageTotal - 7, montageTotal - 1.0).entries()) {
    const txt = closing[i];
    if (txt) push('closing', txt, Number(t.toFixed(1)));
  }

  beats.sort((a, b) => a.montageTime - b.montageTime);
  // Mild monotonic nudge so two beats never collide at the same instant. Kept
  // small (0.8s floor) to NOT stretch the montage rhythm.
  const MIN_GAP = 0.8;
  for (let i = 1; i < beats.length; i += 1) {
    const prev = beats[i - 1];
    const cur = beats[i];
    if (!prev || !cur) continue;
    if (cur.montageTime < prev.montageTime + MIN_GAP) {
      cur.montageTime = Number(Math.min(montageTotal - 0.3, prev.montageTime + MIN_GAP).toFixed(2));
    }
  }

  // 4) Risk analysis (no voice yet — pure estimate).
  const totalSpeech = Number(beats.reduce((s, b) => s + b.estSec, 0).toFixed(1));
  let crowded = 0;
  let maxOver = 0;
  for (let i = 0; i < beats.length; i += 1) {
    const cur = beats[i];
    if (!cur) continue;
    const next = beats[i + 1];
    const window = (next ? next.montageTime : montageTotal) - cur.montageTime;
    if (cur.estSec > window + 0.05) {
      crowded += 1;
      maxOver = Math.max(maxOver, Number((cur.estSec - window).toFixed(2)));
    }
  }
  const longChunks = beats.filter((b) => wordCount(b.text) > 12);
  // Spill to NEXT catch: last beat of a catch must finish before next catch's
  // money-shot. (Within-catch dense narration is intentional, not flagged.)
  const spills: string[] = [];
  for (const seg of catchSegs) {
    const next = catchSegs.find((s) => s.idx === seg.idx + 1);
    if (!next) continue;
    const mine = beats.filter((b) => b.sceneIdx === seg.idx);
    const last = mine[mine.length - 1];
    if (!last) continue;
    const nextMs = msMontage(next);
    if (last.montageTime + last.estSec > nextMs) spills.push(`cú ${msLabel(seg.idx)} → đè money-shot ${msLabel(next.idx)}`);
  }

  // 5) Emit machine script (for step 12 after approval) + human review .md.
  const scriptJson = {
    videoId: id,
    montageTotalSec: Number(montageTotal.toFixed(1)),
    reviewStatus: 'PENDING_OPERATOR_REVIEW',
    scriptModel,
    vibe: vis.vibe ?? '',
    chunkCount: beats.length,
    estTotalSpeechSec: totalSpeech,
    beats,
  };
  writeFileSync(join(clipDir, 'montage_v2_script.json'), JSON.stringify(scriptJson, null, 2));

  const md: string[] = [];
  md.push('# Script review — montage_v2 (⛔ CHỜ DUYỆT, chưa voice/render)');
  md.push('');
  md.push(`- Video: ${id} | tổng ${montageTotal.toFixed(1)}s | ${catchSegs.length} cú mực lên + cảnh mở đầu`);
  md.push(`- Script model: ${scriptModel} (vision: gpt-4o, cached)`);
  md.push(`- Không khí: ${vis.vibe ?? '(—)'}`);
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
  md.push('## QA / RỦI RO (ước tính, chưa có voice thật)');
  md.push(`- Tổng đọc ~${totalSpeech}s trong ${montageTotal.toFixed(1)}s → ${totalSpeech < montageTotal ? '✅ còn dư thời lượng' : '⚠️ kín, dễ tràn'}.`);
  md.push(`- Cụm dài >12 từ: ${longChunks.length === 0 ? '✅ không có' : `⚠️ ${longChunks.length} cụm (${longChunks.map((b) => `"${b.text.slice(0, 20)}…"`).join(', ')})`}.`);
  md.push(`- Caption chật (đọc lâu hơn khoảng tới cụm sau): ${crowded === 0 ? '✅ không' : `⚠️ ${crowded} cụm, tràn tối đa ~${maxOver}s (trong cùng 1 cú — narration dồn dập, không đè money-shot)`}.`);
  md.push(`- Voice tràn sang money-shot CÚ KẾ: ${spills.length === 0 ? '✅ không' : `⚠️ ${spills.join('; ')}`}.`);
  md.push('');
  md.push('> ⛔ Duyệt: sửa trực tiếp field `text` trong `montage_v2_script.json` nếu cần, rồi báo "duyệt script" để chạy voice + render.');
  const mdPath = join(clipDir, 'montage_v2_script_review.md');
  writeFileSync(mdPath, md.join('\n'));

  console.log('------------------------------------------------------');
  console.log(`[11] ✅ Script đã xuất — ${beats.length} cụm (chưa voice/render).`);
  console.log(`     HOOK: ${hook}`);
  console.log(`     Tổng đọc ~${totalSpeech}s / ${montageTotal.toFixed(1)}s | cụm dài>12từ: ${longChunks.length} | tràn cú-kế: ${spills.length}`);
  console.log(`     REVIEW: ${mdPath}`);
  console.log('     ⛔ DỪNG — chờ Operator duyệt nội dung chữ trước khi voice/render.');
  console.log('------------------------------------------------------');
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
