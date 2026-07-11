// E1 — SOURCE CLASSIFIER + story_confidence (R1, READ-ONLY, DETERMINISTIC).
// ---------------------------------------------------------------------------
// WHY: không phải clip câu cá nào cũng có "chuyện". Ép Story Engine lên clip chỉ
// toàn cảnh cá lên → AI bịa persona/hành trình. Lớp này đọc ASR (toàn bộ) + vision
// (catch_moments) đã có, tính các SỐ LIỆU NEO, rồi phân loại bằng LUẬT trên số liệu
// — KHÔNG gọi LLM, KHÔNG render, KHÔNG bịa. Output story_arc.json (read-only).
//
// story_confidence: high | medium | low
// source_type:      story | highlight | story_split_candidate
// Nếu story → đề xuất acts (setup/buildup/escalation/climax/resolution) + bằng chứng.
// Nếu dài + nhiều cụm → đề xuất seam (read-only, KHÔNG render 2 clip).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const STRONG_SCORE = 8; // vision score ≥ = cảnh "ăn tiền" rõ (khớp anchors.ts)

// --- Cue tiếng Trung (đo persona/mạch chuyện). Chọn marker đặc trưng, tránh từ quá phổ biến.
const FIRST_PERSON = ['我']; // ngôi thứ nhất → có người kể
const REACTION_CUES = ['哈哈', '哎呀', '哎哟', '哇', '嘿', '哟', '来了', '居然', '没想到', '太'];
const NARRATIVE_CUES = [
  '然后',
  '又',
  '再',
  '终于',
  '结果',
  '刚',
  '开始',
  '马上',
  '接着',
  '今天',
  '现在',
  '这次',
  '第一',
  '第二',
];

// --- Ngưỡng phân loại (TUNABLE — report in ra số thật để hiệu chỉnh) ---
export const THRESHOLDS = {
  narrationSpeechRatio: 0.3,
  narrationCharsPerMin: 100,
  denseSpeechRatio: 0.45,
  denseCharsPerMin: 150,
  personaCuesMin: 5,
  narrativeCuesMin: 8,
  reactionCuesMin: 4,
  multiBeatStrong: 3,
  splitMinSourceSec: 480,
  splitClusterGapSec: 75, // gap ≥ → tách cụm
  splitMinClusterSpanSec: 40,
};

export interface AsrSeg {
  id: number;
  start: number;
  end: number;
  text: string;
}
export interface CatchMoment {
  tSec: number;
  score: number;
  what?: string;
}

function countOccurrences(haystack: string, needles: string[]): number {
  let n = 0;
  for (const w of needles) {
    let i = haystack.indexOf(w);
    while (i !== -1) {
      n += 1;
      i = haystack.indexOf(w, i + w.length);
    }
  }
  return n;
}

export interface AsrMetrics {
  speechSec: number;
  speechRatio: number;
  charCount: number;
  charsPerMin: number;
  segCount: number;
  firstPersonCues: number;
  reactionCues: number;
  narrativeCues: number;
  vocabDiversity: number;
}

export function computeAsrMetrics(
  segments: AsrSeg[],
  fullText: string,
  sourceDur: number,
): AsrMetrics {
  const valid = segments.filter((s) => s.text?.trim());
  const speechSec = valid.reduce((s, x) => s + Math.max(0, x.end - x.start), 0);
  const text = fullText || valid.map((s) => s.text).join('');
  const cjk = text.match(/[一-鿿]/g) ?? [];
  const charCount = cjk.length;
  const uniq = new Set(cjk).size;
  const minutes = sourceDur > 0 ? sourceDur / 60 : 1;
  return {
    speechSec: Number(speechSec.toFixed(1)),
    speechRatio: Number((sourceDur > 0 ? speechSec / sourceDur : 0).toFixed(3)),
    charCount,
    charsPerMin: Number((charCount / minutes).toFixed(1)),
    segCount: valid.length,
    firstPersonCues: countOccurrences(text, FIRST_PERSON),
    reactionCues: countOccurrences(text, REACTION_CUES),
    narrativeCues: countOccurrences(text, NARRATIVE_CUES),
    vocabDiversity: Number((charCount > 0 ? uniq / charCount : 0).toFixed(3)),
  };
}

export interface Cluster {
  startSec: number;
  endSec: number;
  count: number;
  strongCount: number;
  maxScore: number;
}
export interface VisionMetrics {
  nMoments: number;
  nStrong: number;
  maxScore: number;
  meanGapSec: number;
  maxGapSec: number;
  clusters: Cluster[];
}

export function computeVisionMetrics(moments: CatchMoment[]): VisionMetrics {
  const ms = [...moments].filter((m) => Number.isFinite(m.tSec)).sort((a, b) => a.tSec - b.tSec);
  const strong = ms.filter((m) => m.score >= STRONG_SCORE);
  const gaps: number[] = [];
  for (let i = 1; i < ms.length; i += 1) gaps.push(ms[i].tSec - ms[i - 1].tSec);
  const clusters: Cluster[] = [];
  for (const m of ms) {
    const last = clusters[clusters.length - 1];
    if (last && m.tSec - last.endSec <= THRESHOLDS.splitClusterGapSec) {
      last.endSec = m.tSec;
      last.count += 1;
      if (m.score >= STRONG_SCORE) last.strongCount += 1;
      last.maxScore = Math.max(last.maxScore, m.score);
    } else {
      clusters.push({
        startSec: m.tSec,
        endSec: m.tSec,
        count: 1,
        strongCount: m.score >= STRONG_SCORE ? 1 : 0,
        maxScore: m.score,
      });
    }
  }
  return {
    nMoments: ms.length,
    nStrong: strong.length,
    maxScore: ms.reduce((a, m) => Math.max(a, m.score), 0),
    meanGapSec: gaps.length
      ? Number((gaps.reduce((a, g) => a + g, 0) / gaps.length).toFixed(1))
      : 0,
    maxGapSec: gaps.length ? Number(Math.max(...gaps).toFixed(1)) : 0,
    clusters,
  };
}

export type StoryConfidence = 'high' | 'medium' | 'low';
export type SourceType = 'story' | 'highlight' | 'story_split_candidate';

export interface Classification {
  story_confidence: StoryConfidence;
  confidenceReason: string;
  source_type: SourceType;
  typeReason: string;
  signals: Record<string, boolean>;
}

/** Phân loại bằng LUẬT trên số liệu neo (không LLM). */
export function classify(asr: AsrMetrics, vis: VisionMetrics, sourceDur: number): Classification {
  const T = THRESHOLDS;
  const hasNarration =
    asr.speechRatio >= T.narrationSpeechRatio && asr.charsPerMin >= T.narrationCharsPerMin;
  const denseNarration =
    asr.speechRatio >= T.denseSpeechRatio && asr.charsPerMin >= T.denseCharsPerMin;
  const hasPersona = asr.firstPersonCues >= T.personaCuesMin;
  const hasStoryLang =
    asr.narrativeCues >= T.narrativeCuesMin || asr.reactionCues >= T.reactionCuesMin;
  const hasClimax = vis.nStrong >= 1;
  const multiBeat = vis.nStrong >= T.multiBeatStrong;
  const signals = { hasNarration, denseNarration, hasPersona, hasStoryLang, hasClimax, multiBeat };

  let story_confidence: StoryConfidence;
  if (denseNarration && hasPersona && hasStoryLang && multiBeat) story_confidence = 'high';
  else if (hasNarration && (hasPersona || hasStoryLang) && hasClimax) story_confidence = 'medium';
  else story_confidence = 'low';

  const confidenceReason =
    `speechRatio=${asr.speechRatio} (≥${T.denseSpeechRatio}? ${asr.speechRatio >= T.denseSpeechRatio}), ` +
    `charsPerMin=${asr.charsPerMin} (≥${T.denseCharsPerMin}? ${asr.charsPerMin >= T.denseCharsPerMin}), ` +
    `persona=${asr.firstPersonCues} (≥${T.personaCuesMin}? ${hasPersona}), ` +
    `narrative=${asr.narrativeCues}/react=${asr.reactionCues} (storyLang? ${hasStoryLang}), ` +
    `strongMoments=${vis.nStrong} (multiBeat? ${multiBeat})`;

  // Split: source dài + ≥2 cụm, mỗi cụm chính có span đủ + có cảnh mạnh.
  const bigClusters = vis.clusters.filter(
    (c) => c.endSec - c.startSec >= T.splitMinClusterSpanSec && c.strongCount >= 1,
  );
  const splittable =
    sourceDur >= T.splitMinSourceSec && vis.clusters.length >= 2 && bigClusters.length >= 2;

  let source_type: SourceType;
  let typeReason: string;
  if (story_confidence === 'low' || !hasClimax) {
    source_type = 'highlight';
    typeReason = `confidence=${story_confidence}, hasClimax=${hasClimax} → không ép story, dùng Highlight Engine tối ưu.`;
  } else if (splittable && multiBeat) {
    source_type = 'story_split_candidate';
    typeReason = `dur=${Math.round(sourceDur)}s≥${T.splitMinSourceSec}, clusters=${vis.clusters.length}, bigClusters=${bigClusters.length} → có thể tách 2 mạch (read-only).`;
  } else {
    source_type = 'story';
    typeReason = `confidence=${story_confidence}, strongMoments=${vis.nStrong} → Story Engine (1 clip).`;
  }

  return { story_confidence, confidenceReason, source_type, typeReason, signals };
}

export interface ActPlan {
  role: 'setup' | 'buildup' | 'escalation' | 'climax' | 'resolution';
  srcStart: number;
  srcEnd: number;
  catchTSecs: number[];
  asrEvidence: string[];
}

function asrIn(segments: AsrSeg[], a: number, b: number, max = 2): string[] {
  return segments
    .filter((s) => s.text?.trim() && s.end > a && s.start < b)
    .slice(0, max)
    .map((s) => s.text.trim());
}

/** Đề xuất acts (heuristic CÓ BẰNG CHỨNG — mỗi act trích catch + lời ASR thật, không bịa). */
export function proposeActs(
  moments: CatchMoment[],
  segments: AsrSeg[],
  sourceDur: number,
): ActPlan[] {
  const ms = [...moments].filter((m) => Number.isFinite(m.tSec)).sort((a, b) => a.tSec - b.tSec);
  if (ms.length === 0) return [];
  const strong = ms.filter((m) => m.score >= STRONG_SCORE);
  const firstStrong = strong[0] ?? ms[0];
  // climax = score cao nhất; hoà → muộn nhất.
  let climax = ms[0];
  for (const m of ms)
    if (m.score > climax.score || (m.score === climax.score && m.tSec > climax.tSec)) climax = m;
  const last = ms[ms.length - 1];

  const setupEnd = Math.max(2, firstStrong.tSec - 8);
  const climaxStart = Math.max(setupEnd, climax.tSec - 8);
  const climaxEnd = Math.min(sourceDur, climax.tSec + 12);
  const mid = (setupEnd + climaxStart) / 2;
  const tsIn = (a: number, b: number) =>
    ms.filter((m) => m.tSec >= a && m.tSec < b).map((m) => m.tSec);

  const acts: ActPlan[] = [
    {
      role: 'setup',
      srcStart: 0,
      srcEnd: Number(setupEnd.toFixed(1)),
      catchTSecs: tsIn(0, setupEnd),
      asrEvidence: asrIn(segments, 0, setupEnd),
    },
    {
      role: 'buildup',
      srcStart: Number(setupEnd.toFixed(1)),
      srcEnd: Number(mid.toFixed(1)),
      catchTSecs: tsIn(setupEnd, mid),
      asrEvidence: asrIn(segments, setupEnd, mid),
    },
    {
      role: 'escalation',
      srcStart: Number(mid.toFixed(1)),
      srcEnd: Number(climaxStart.toFixed(1)),
      catchTSecs: tsIn(mid, climaxStart),
      asrEvidence: asrIn(segments, mid, climaxStart),
    },
    {
      role: 'climax',
      srcStart: Number(climaxStart.toFixed(1)),
      srcEnd: Number(climaxEnd.toFixed(1)),
      catchTSecs: tsIn(climaxStart, climaxEnd),
      asrEvidence: asrIn(segments, climaxStart, climaxEnd),
    },
    {
      role: 'resolution',
      srcStart: Number(climaxEnd.toFixed(1)),
      srcEnd: Number(sourceDur.toFixed(1)),
      catchTSecs: tsIn(climaxEnd, sourceDur + 1),
      asrEvidence: asrIn(segments, climaxEnd, sourceDur),
    },
  ];
  return acts.filter((a) => a.srcEnd > a.srcStart);
}

export interface SeamPlan {
  recommended: boolean;
  seamSec: number;
  reason: string;
  part1: { srcStart: number; srcEnd: number; miniClimaxTSec: number };
  part2: { srcStart: number; srcEnd: number; climaxTSec: number };
}

/** Đề xuất seam tách 2 clip (read-only). Tách theo GAP cụm lớn nhất, không theo 50%. */
export function proposeSeam(
  vis: VisionMetrics,
  moments: CatchMoment[],
  sourceDur: number,
): SeamPlan | null {
  if (vis.clusters.length < 2) return null;
  // Gap lớn nhất giữa 2 cụm liên tiếp = seam tự nhiên.
  let bestGap = -1;
  let seam = 0;
  let splitIdx = 0;
  for (let i = 1; i < vis.clusters.length; i += 1) {
    const gap = vis.clusters[i].startSec - vis.clusters[i - 1].endSec;
    if (gap > bestGap) {
      bestGap = gap;
      seam = (vis.clusters[i].startSec + vis.clusters[i - 1].endSec) / 2;
      splitIdx = i;
    }
  }
  const ms = [...moments].sort((a, b) => a.tSec - b.tSec);
  const before = ms.filter((m) => m.tSec < seam);
  const after = ms.filter((m) => m.tSec >= seam);
  if (before.length === 0 || after.length === 0) return null;
  const strongest = (arr: CatchMoment[]) =>
    arr.reduce((b, m) => (m.score > b.score ? m : b), arr[0]);
  return {
    recommended: true,
    seamSec: Number(seam.toFixed(1)),
    reason: `gap lớn nhất ${bestGap.toFixed(0)}s giữa cụm ${splitIdx}/${splitIdx + 1}; part1 ${before.length} cảnh (đỉnh ${strongest(before).score}), part2 ${after.length} cảnh (đỉnh ${strongest(after).score}).`,
    part1: { srcStart: 0, srcEnd: Number(seam.toFixed(1)), miniClimaxTSec: strongest(before).tSec },
    part2: {
      srcStart: Number(seam.toFixed(1)),
      srcEnd: Number(sourceDur.toFixed(1)),
      climaxTSec: strongest(after).tSec,
    },
  };
}

export interface StoryArc {
  videoId: string;
  engine: string;
  sourceDurationSec: number;
  metrics: { asr: AsrMetrics; vision: VisionMetrics };
  story_confidence: StoryConfidence;
  confidenceReason: string;
  source_type: SourceType;
  typeReason: string;
  signals: Record<string, boolean>;
  acts: ActPlan[] | null;
  split: SeamPlan | null;
  generatedAt: string;
}

// ===========================================================================
// R2 — STORY SELECTION (video-only). Biến acts (toàn bộ source) thành danh sách
// segment montage theo MẠCH CHUYỆN: setup (intro persona) → buildup/escalation
// (cá lên dồn, chọn cú mạnh mỗi act) → climax (con to nhất, trọn) → resolution
// (chốt). Thứ tự = thời gian gốc. KHÔNG VO/audio/teaser ở R2 — chỉ kiểm cấu trúc.
// ===========================================================================

// Budget calibrate cho Facebook Reels (max 90s): tổng tối đa khi đủ act/cú =
// hook ~5.2 + setup 9 + buildup 14 + escalation 2×14 + climax 23 + resolution 8
// = ~87s (chừa margin dưới trần 90s). Cắt dài hơn bản TikTok cũ (~60-65s) để giữ
// mạch kể chuyện + tiếng động tự nhiên; video thiếu cú thì tự ngắn lại (emergent).
export const STORY_BUDGET = {
  setupSec: 9,
  resolutionSec: 8,
  bodyLead: 8,
  bodyReaction: 6,
  climaxLead: 9,
  climaxReaction: 14,
  escalationCatches: 2,
  // RV1.5 HOOK HÌNH 0–5s: mở thẳng bằng money-shot SẠCH/MẠNH nhất (cá lên), KHÔNG
  // setup/title đầu video. Chọn cú mạnh nhất có tSec ≥ guard (tránh vùng title/intro
  // ở đầu source). 1–2 shot action nối lại ~5s. Tất cả footage THẬT → không bịa.
  hookTargetSec: 5,
  hookGuardSrcSec: 12, // cú dùng cho hook phải ở sâu trong source (qua intro/title)
  hookShot1Lead: 1.0, // shot1: cá lên ở ~1.0s → action rõ trong 0–1.5s đầu
  hookShot1Reaction: 1.8, // shot1 ~2.8s
  hookShot2Lead: 0.8,
  hookShot2Reaction: 1.6, // shot2 ~2.4s → tổng ~5.2s (frame@5.0s vẫn là hook, chưa vào setup)
  hookMinGapSrcSec: 8, // 2 cú hook cách nhau ≥8s nguồn (khác cảnh, không lặp khung)
};

export interface StorySeg {
  idx: number;
  role: ActPlan['role'] | 'teaser'; // 'teaser' = lát climax chèn đầu (RV1, visual-only)
  tSec: number; // mốc cá (act có cá) hoặc tâm cửa sổ (setup/resolution)
  srcStart: number;
  srcEnd: number;
  dur: number;
  montageStart: number;
}
export interface StoryBuild {
  videoId: string;
  source_type: SourceType;
  story_confidence: StoryConfidence;
  segs: StorySeg[];
  montageTotalSec: number;
  note?: string;
}

/**
 * Có dùng Story Engine cho job này không? OPT-IN ở R3: chỉ bật khi
 * ENT_MONTAGE_ENGINE=story VÀ source_type != highlight VÀ dựng được segs.
 * Mặc định (không cờ) hoặc ENT_MONTAGE_ENGINE=anchors → false → giữ engine cũ.
 */
export function isStoryEngine(dir: string, videoId: string): boolean {
  if (process.env.ENT_MONTAGE_ENGINE !== 'story') return false;
  try {
    const b = buildStorySegments(dir, videoId);
    return b.source_type !== 'highlight' && b.segs.length > 0;
  } catch {
    return false;
  }
}

/** Catch/cao trào (money-shot thật) — KHÔNG tính setup/resolution. */
export function isMoneyShotRole(role: StorySeg['role']): boolean {
  return role === 'buildup' || role === 'escalation' || role === 'climax';
}

/**
 * Dựng segment theo mạch chuyện từ story_arc. Source 'highlight' → segs rỗng
 * (R2 chỉ lo story; highlight engine là R4). KHÔNG render — caller cắt ffmpeg.
 */
export function buildStorySegments(dir: string, videoId: string): StoryBuild {
  const arc = buildStoryArc(dir, videoId);
  const sourceDur = arc.sourceDurationSec;
  const base: StoryBuild = {
    videoId,
    source_type: arc.source_type,
    story_confidence: arc.story_confidence,
    segs: [],
    montageTotalSec: 0,
  };
  if (!arc.acts || arc.source_type === 'highlight') {
    return { ...base, note: 'source_type=highlight → story cut N/A (dùng Highlight Engine ở R4).' };
  }

  const cm = JSON.parse(readFileSync(join(dir, 'catch_moments.json'), 'utf8')) as {
    moments: CatchMoment[];
  };
  const moments = [...(cm.moments ?? [])].sort((a, b) => a.tSec - b.tSec);
  const inRange = (a: number, b: number) => moments.filter((m) => m.tSec >= a && m.tSec < b);
  const strongestN = (a: number, b: number, n: number) =>
    inRange(a, b)
      .sort((x, y) => y.score - x.score)
      .slice(0, n)
      .sort((x, y) => x.tSec - y.tSec);

  // hook_clean.json (03e OCR-gate): shots hook sạch + setupSrcStart skip title-card intro.
  let hookClean: {
    shots?: Array<{ tSec: number; srcStart: number; srcEnd: number }>;
    setupSrcStart?: number;
  } | null = null;
  try {
    hookClean = JSON.parse(readFileSync(join(dir, 'hook_clean.json'), 'utf8'));
  } catch {
    hookClean = null;
  }
  const setupSrcStart = hookClean?.setupSrcStart ?? 0;

  const B = STORY_BUDGET;
  const segs: StorySeg[] = [];
  let running = 0;
  const push = (role: ActPlan['role'], tSec: number, rawStart: number, rawEnd: number) => {
    // Chặn MỌI seg thân liếm vào TITLE-CARD INTRO nguồn (src < setupSrcStart từ 03e):
    // dời cửa sổ tới SAU title nhưng GIỮ NGUYÊN độ dài (đã clamp) → timeline montage
    // không đổi (script/caption đã viết vẫn khớp). Trước đây chỉ seg 'setup' né title;
    // buildup/escalation lấy money-shot sớm vẫn clamp về src 0.0 → lọt title (bug 12s).
    let srcStart = Math.max(0, rawStart);
    let srcEnd = Math.min(sourceDur, rawEnd);
    if (setupSrcStart > 0 && srcStart < setupSrcStart) {
      const keepDur = srcEnd - srcStart; // giữ đúng độ dài đã clamp
      srcStart = setupSrcStart;
      srcEnd = Math.min(sourceDur, srcStart + keepDur);
    }
    const dur = Number((srcEnd - srcStart).toFixed(3));
    if (dur <= 0.5) return;
    segs.push({
      idx: segs.length,
      role,
      tSec: Number(tSec.toFixed(1)),
      srcStart,
      srcEnd,
      dur,
      montageStart: Number(running.toFixed(3)),
    });
    running += dur;
  };

  for (const act of arc.acts) {
    if (act.role === 'setup') {
      // Lát intro persona "ra khơi…" — SKIP title-card intro (setupSrcStart từ 03e).
      const ss = Math.max(act.srcStart, setupSrcStart);
      push('setup', ss + 2, ss, ss + B.setupSec);
    } else if (act.role === 'resolution') {
      // Lát chốt từ ĐẦU resolution (wrap/đếm cá).
      push('resolution', act.srcStart + 2, act.srcStart, act.srcStart + B.resolutionSec);
    } else if (act.role === 'climax') {
      const c = strongestN(act.srcStart, act.srcEnd, 1)[0] ?? {
        tSec: (act.srcStart + act.srcEnd) / 2,
        score: 0,
      };
      push('climax', c.tSec, c.tSec - B.climaxLead, c.tSec + B.climaxReaction);
    } else {
      // buildup = 1 cú mạnh nhất; escalation = tối đa 2 cú leo thang.
      const n = act.role === 'escalation' ? B.escalationCatches : 1;
      const picks = strongestN(act.srcStart, act.srcEnd, n);
      if (picks.length === 0) {
        const mid = (act.srcStart + act.srcEnd) / 2;
        push(act.role, mid, mid - 3, mid + 3);
      } else {
        for (const c of picks) push(act.role, c.tSec, c.tSec - B.bodyLead, c.tSec + B.bodyReaction);
      }
    }
  }

  // RV1.5 — HOOK HÌNH 0–5s: chèn 1–2 lát money-shot MẠNH NHẤT (cá lên) lên ĐẦU
  // video làm hook. KHÔNG dùng setup/title đầu source (chỉ chọn cú có tSec ≥ guard).
  // VISUAL-ONLY: 12/13 chừa [0..hookDur] khỏi VO/caption → hook im tiếng (chỉ ambient)
  // + không chữ kể. Footage THẬT từ source → không bịa. Tắt bằng ENT_STORY_TEASER=off.
  if (process.env.ENT_STORY_TEASER !== 'off') {
    // Cửa sổ hook = ƯU TIÊN hook_clean.json (03e OCR-gate: đã loại frame title Trung).
    // File tồn tại + shots rỗng → KHÔNG có hook sạch → bỏ hook (tránh title). File
    // VẮNG (03e chưa chạy) → fallback chọn theo vision-score (có thể dính title).
    let winList: Array<{ tSec: number; srcStart: number; srcEnd: number }> | null = hookClean
      ? (hookClean.shots ?? []).map((s) => ({
          tSec: s.tSec,
          srcStart: s.srcStart,
          srcEnd: s.srcEnd,
        }))
      : null; // null = chưa có 03e → fallback score-based bên dưới
    if (winList === null) {
      const strong = moments
        .filter((m) => m.tSec >= B.hookGuardSrcSec)
        .sort((a, b) => b.score - a.score);
      const c1t = strong[0]?.tSec ?? segs.find((s) => s.role === 'climax')?.tSec;
      if (c1t != null) {
        const c2 = strong.find((m) => Math.abs(m.tSec - c1t) >= B.hookMinGapSrcSec);
        const shots = c2
          ? [
              { t: c1t, lead: B.hookShot1Lead, reaction: B.hookShot1Reaction },
              { t: c2.tSec, lead: B.hookShot2Lead, reaction: B.hookShot2Reaction },
            ]
          : [{ t: c1t, lead: 1.2, reaction: B.hookTargetSec - 1.2 }];
        winList = shots.map((sh) => ({
          tSec: sh.t,
          srcStart: Math.max(0, sh.t - sh.lead),
          srcEnd: Math.min(sourceDur, sh.t + sh.reaction),
        }));
      } else {
        winList = [];
      }
    }
    {
      const hookSegs: StorySeg[] = [];
      let hStart = 0;
      for (const w of winList) {
        const s0 = Math.max(0, w.srcStart);
        const s1 = Math.min(sourceDur, w.srcEnd);
        const d = Number((s1 - s0).toFixed(3));
        if (d <= 0.5) continue;
        hookSegs.push({
          idx: hookSegs.length,
          role: 'teaser',
          tSec: Number(w.tSec.toFixed(1)),
          srcStart: s0,
          srcEnd: s1,
          dur: d,
          montageStart: Number(hStart.toFixed(3)),
        });
        hStart = Number((hStart + d).toFixed(3));
      }
      if (hookSegs.length > 0) {
        const hookDur = hStart;
        for (const s of segs) {
          s.idx += hookSegs.length;
          s.montageStart = Number((s.montageStart + hookDur).toFixed(3));
        }
        segs.unshift(...hookSegs);
        running = Number((running + hookDur).toFixed(3));
      }
    }
  }

  return { ...base, segs, montageTotalSec: Number(running.toFixed(2)) };
}

/** Đọc artifact đã có trong job dir → dựng story_arc (KHÔNG ghi, caller ghi). */
export function buildStoryArc(dir: string, videoId: string): StoryArc {
  const meta = JSON.parse(readFileSync(join(dir, 'source_meta.json'), 'utf8')) as {
    durationSec: number;
  };
  const asrRaw = JSON.parse(readFileSync(join(dir, 'asr_zh.json'), 'utf8')) as {
    segments: AsrSeg[];
    fullText?: string;
  };
  const cm = JSON.parse(readFileSync(join(dir, 'catch_moments.json'), 'utf8')) as {
    moments: CatchMoment[];
  };
  const sourceDur = meta.durationSec;
  const asr = computeAsrMetrics(asrRaw.segments ?? [], asrRaw.fullText ?? '', sourceDur);
  const vis = computeVisionMetrics(cm.moments ?? []);
  const cls = classify(asr, vis, sourceDur);
  const isStory = cls.source_type !== 'highlight';
  const acts = isStory ? proposeActs(cm.moments ?? [], asrRaw.segments ?? [], sourceDur) : null;
  const split =
    cls.source_type === 'story_split_candidate'
      ? proposeSeam(vis, cm.moments ?? [], sourceDur)
      : null;
  return {
    videoId,
    engine: 'classifier-v1-deterministic',
    sourceDurationSec: Number(sourceDur.toFixed(2)),
    metrics: { asr, vision: vis },
    story_confidence: cls.story_confidence,
    confidenceReason: cls.confidenceReason,
    source_type: cls.source_type,
    typeReason: cls.typeReason,
    signals: cls.signals,
    acts,
    split,
    generatedAt: new Date().toISOString(),
  };
}
