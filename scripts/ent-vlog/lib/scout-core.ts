// Trend Scout — PURE core (parse / filter / score / merge / report).
// ---------------------------------------------------------------------------
// WHY: tách toàn bộ logic chấm điểm "video sắp viral" khỏi browser để test được
// không cần mạng. Nguyên tắc (theo quy trình 10 phút/ngày của Operator): KHÔNG
// tìm video đã triệu view — tìm video MỚI ĐĂNG (30 phút–6 giờ) có tốc độ tăng
// like bất thường so với tuổi (20 phút/8k like = rất mạnh). Điểm số ưu tiên
// likes/phút, cộng hưởng khi comment-ratio nóng.
//
// ZERO I/O: không fs, không playwright, không Date.now() nội bộ — caller truyền
// nowMs. Số liệu CHỈ tin network JSON (DOM hiển thị "1.2万" không parse được).

export interface ScoutThresholds {
  ageMinMinutes: number;
  ageMaxMinutes: number;
  /** likes/phút quy chiếu điểm 100 (calibrate: 8k like sau 20 phút = 400 l/ph). */
  refLikesPerMinute: number;
  /** Dưới sàn likes/phút → loại hẳn (không đáng xem). */
  floorLikesPerMinute: number;
  /** comment/digg quy chiếu cho tín hiệu "comment đang nóng". */
  commentRatioRef: number;
  /** Trần hệ số cộng điểm từ comment-ratio. */
  commentBoostMax: number;
}

export interface ScoutSearchConfig {
  targetPerKeyword: number;
  scrollBudgetMs: number;
  keywordDelayMsMin: number;
  keywordDelayMsMax: number;
}

/** Ngách sản phẩm con — query = [format] + [productTerm] (chống keyword thả nổi). */
export interface ScoutSubNiche {
  id: string;
  label: string;
  productTerms: string[];
}

/**
 * VOE product gate — constraint CỨNG trên desc, loại video không có bằng chứng
 * sản phẩm vật lý TRƯỚC khi lên UI (rác du lịch/phong cảnh/giải trí thuần).
 */
export interface ScoutProductGate {
  /** Phải khớp ≥1 (dấu vết thương mại: 开箱/测评/好物… + productTerms ngách con). */
  productEvidence: string[];
  /** Hành động sản phẩm mạnh — cứu video có marker rác nhưng thật sự là đập hộp. */
  strongProductActions: string[];
  /** Marker nội dung thuần (phong cảnh/du lịch/giải trí) — dính mà không có strong action → loại. */
  garbageMarkers: string[];
}

export interface ScoutConfig {
  niche: string;
  label: string;
  channelId?: string;
  keywords: string[];
  /** Schema combo (pov-review): có formats+subNiches thì keywords phẳng BỊ CẤM. */
  formats?: string[];
  subNiches?: ScoutSubNiche[];
  productGate?: ScoutProductGate;
  thresholds: ScoutThresholds;
  search: ScoutSearchConfig;
}

/** Query cuối = cross product [format] × [productTerm] của ngách con đã chọn. */
export function resolveComboKeywords(formats: string[], subNiche: ScoutSubNiche): string[] {
  const out: string[] = [];
  for (const term of subNiche.productTerms) {
    for (const format of formats) {
      const kw = `${format} ${term}`.trim();
      if (!out.includes(kw)) out.push(kw);
    }
  }
  return out;
}

/** 1 video thô parse từ JSON search API (chưa lọc, chưa chấm điểm). */
export interface RawSearchItem {
  awemeId: string;
  desc: string;
  /** unix seconds; null khi payload thiếu — sẽ bị loại (noTimestamp). */
  createTimeSec: number | null;
  diggCount: number;
  commentCount: number;
  shareCount: number;
  collectCount: number | null;
  durationSec: number | null;
  cover: string | null;
  author: { uid: string | null; secUid: string | null; nickname: string | null };
}

export type ScoutSignal =
  | 'VERY_STRONG'
  | 'STRONG'
  | 'WARM'
  | 'COMMENTS_HOT'
  | 'FRESH_LT_60M'
  | 'ALREADY_JOBBED'
  // Monetization Fit (chỉ khi gate bật): STRONG = có thao tác review/đập hộp rõ.
  | 'FIT_STRONG'
  | 'FIT_WEAK';

export interface ScoutCandidate {
  awemeId: string;
  url: string;
  desc: string;
  createdAt: string;
  capturedAt: string;
  ageMinutes: number;
  diggCount: number;
  commentCount: number;
  shareCount: number;
  collectCount: number | null;
  durationSec: number | null;
  cover: string | null;
  author: { uid: string | null; secUid: string | null; nickname: string | null };
  keyword: string;
  likesPerMinute: number;
  score: number;
  signals: ScoutSignal[];
  reason: string;
  alreadyJobbed: boolean;
  /** Round 3 (rescan): Δlike giữa 2 snapshot = velocity thật. Schema sẵn từ ngày 1. */
  delta?: {
    prevCapturedAt: string;
    prevDiggCount: number;
    deltaMinutes: number;
    trueLikesPerMinute: number;
  };
  /** Round 3 (inspect-creators): format lặp của creator. */
  creator?: { recentListed: number; poolHits: number; formatHint: string | null };
  /** VOE gate: term bằng chứng sản phẩm đã khớp trong desc (minh bạch vì sao lọt lưới). */
  gateEvidence?: string[];
  /** Monetization Fit 0–100 (chỉ khi gate bật) — phần QUYẾT ĐỊNH của score, tách khỏi viral. */
  monetizationFit?: number;
}

export interface RejectedCounts {
  tooOld: number;
  tooNew: number;
  noTimestamp: number;
  belowFloor: number;
  /** VOE gate: desc không có bằng chứng sản phẩm (chỉ tăng khi gate bật). */
  noProductEvidence: number;
  /** VOE gate: dính marker rác (du lịch/phong cảnh/giải trí) không được strong action cứu. */
  garbageContent: number;
}

export interface ScoutSnapshot {
  schemaVersion: 1;
  runId: string;
  niche: string;
  startedAt: string;
  finishedAt: string;
  keywords: string[];
  keywordsCompleted: number;
  filters: { ageMinMinutes: number; ageMaxMinutes: number; sortHint: 'newest' };
  /** Copy đóng băng để tái lập kết quả — snapshot tự đủ, không phụ thuộc config trôi. */
  thresholds: ScoutThresholds;
  status: 'OK' | 'PARTIAL_CAPTCHA' | 'PARTIAL_NAV_FAILED';
  /** Ngách con đã chọn khi quét (schema combo) — null/vắng = quét keyword phẳng. */
  subNiche?: { id: string; label: string } | null;
  /** VOE product gate có chạy trong lượt quét này không (đọc report cho đúng ngữ cảnh). */
  productGateApplied?: boolean;
  /** Round 3: đường dẫn snapshot gốc khi đây là lượt rescan. */
  rescanOf?: string;
  rejectedCounts: RejectedCounts;
  /** Id chỉ thấy qua DOM (không có số liệu) — hiển thị cho biết, KHÔNG xếp hạng. */
  domOnlyIds: string[];
  candidates: ScoutCandidate[];
}

// --- Parse network JSON ------------------------------------------------------

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Coerce số đếm từ JSON (number hoặc string "8000") → number ≥ 0; hỏng → null. */
function asCount(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.round(v);
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number.parseInt(v.trim(), 10);
  return null;
}

function asStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function parseAweme(raw: unknown): RawSearchItem | null {
  const a = asRecord(raw);
  if (!a) return null;
  const awemeId = asStr(a.aweme_id);
  if (!awemeId || !/^\d+$/.test(awemeId)) return null;
  const stats = asRecord(a.statistics) ?? {};
  const video = asRecord(a.video) ?? {};
  const cover = asRecord(video.cover) ?? {};
  const coverList = Array.isArray(cover.url_list) ? cover.url_list : [];
  const author = asRecord(a.author) ?? {};
  const durationMs = asCount(video.duration);
  return {
    awemeId,
    desc: asStr(a.desc) ?? '',
    createTimeSec: asCount(a.create_time),
    diggCount: asCount(stats.digg_count) ?? 0,
    commentCount: asCount(stats.comment_count) ?? 0,
    shareCount: asCount(stats.share_count) ?? 0,
    collectCount: asCount(stats.collect_count),
    durationSec: durationMs !== null ? Math.round(durationMs / 1000) : null,
    cover: asStr(coverList[0]),
    author: {
      uid: asStr(author.uid),
      secUid: asStr(author.sec_uid),
      nickname: asStr(author.nickname),
    },
  };
}

/**
 * Parse 1 body JSON của Douyin search API → items. Chịu cả 3 shape đã biết:
 *  A. `{ data: [{ aweme_info: {...} }] }`            (search video tab)
 *  B. `{ data: [{ card_unique_name, aweme_info }] }` (general search — lọc card video)
 *  C. `{ aweme_list: [...] }`                        (shape kiểu post-list)
 * Body lạ / null / non-object → [] (KHÔNG throw — listener network không được chết).
 */
export function parseSearchResponse(json: unknown): RawSearchItem[] {
  const root = asRecord(json);
  if (!root) return [];
  const out: RawSearchItem[] = [];
  if (Array.isArray(root.aweme_list)) {
    for (const raw of root.aweme_list) {
      const item = parseAweme(raw);
      if (item) out.push(item);
    }
    return out;
  }
  if (Array.isArray(root.data)) {
    for (const entry of root.data) {
      const e = asRecord(entry);
      if (!e) continue;
      const item = parseAweme(e.aweme_info ?? e);
      if (item) out.push(item);
    }
  }
  return out;
}

// --- Filter / score ----------------------------------------------------------

export function ageMinutesOf(item: RawSearchItem, nowMs: number): number | null {
  if (item.createTimeSec === null) return null;
  return (nowMs / 1000 - item.createTimeSec) / 60;
}

export function filterByAge<T extends RawSearchItem>(
  items: T[],
  nowMs: number,
  t: ScoutThresholds,
): { inWindow: T[]; tooOld: number; tooNew: number; noTimestamp: number } {
  const inWindow: T[] = [];
  let tooOld = 0;
  let tooNew = 0;
  let noTimestamp = 0;
  for (const item of items) {
    const age = ageMinutesOf(item, nowMs);
    if (age === null) {
      noTimestamp += 1;
    } else if (age < t.ageMinMinutes) {
      // Gồm cả timestamp tương lai (age âm) — dữ liệu không tin được.
      tooNew += 1;
    } else if (age > t.ageMaxMinutes) {
      tooOld += 1;
    } else {
      inWindow.push(item);
    }
  }
  return { inWindow, tooOld, tooNew, noTimestamp };
}

function formatCount(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

/**
 * Điểm single-snapshot (ước lượng, giả định like tích lũy tuyến tính — nhãn rõ
 * trong report; Round 3 rescan Δlike/Δt mới là velocity thật):
 *   lpm   = digg / max(tuổi phút, 1)
 *   vel   = lpm / refLikesPerMinute   (400 l/ph = 1.0 = "20 phút 8k like")
 *   base  = 100 * min(vel, 3)         (cap outlier)
 *   ratio = comment / max(digg, 50)   (sàn 50 chống nhiễu mẫu nhỏ)
 *   score = base * (1 + commentBoostMax * min(ratio/commentRatioRef, 1))
 */
export function computeScore(
  item: RawSearchItem,
  nowMs: number,
  t: ScoutThresholds,
): { score: number; likesPerMinute: number; signals: ScoutSignal[]; reason: string } {
  const rawAge = ageMinutesOf(item, nowMs) ?? 1;
  const ageMin = Math.max(rawAge, 1);
  const lpm = item.diggCount / ageMin;
  const vel = lpm / t.refLikesPerMinute;
  const base = 100 * Math.min(vel, 3);
  const ratio = item.commentCount / Math.max(item.diggCount, 50);
  const boost = t.commentBoostMax * Math.min(ratio / t.commentRatioRef, 1);
  const score = base * (1 + boost);

  const signals: ScoutSignal[] = [];
  let velLabel = 'yếu';
  if (vel >= 1) {
    signals.push('VERY_STRONG');
    velLabel = 'rất mạnh';
  } else if (vel >= 0.5) {
    signals.push('STRONG');
    velLabel = 'mạnh';
  } else if (vel >= 0.15) {
    signals.push('WARM');
    velLabel = 'ấm';
  }
  const commentsHot = ratio >= t.commentRatioRef;
  if (commentsHot) signals.push('COMMENTS_HOT');
  if (ageMin < 60) signals.push('FRESH_LT_60M');

  const reasonParts = [
    `${formatCount(item.diggCount)} likes sau ${Math.round(ageMin)} phút (${Math.round(lpm)} likes/phút — ${velLabel})`,
  ];
  if (commentsHot) reasonParts.push(`comment ${(ratio * 100).toFixed(1)}% đang nóng`);
  return {
    score: Math.round(score * 10) / 10,
    likesPerMinute: Math.round(lpm * 10) / 10,
    signals,
    reason: reasonParts.join(', '),
  };
}

// --- VOE product gate ----------------------------------------------------------

export type ProductGateVerdict =
  | { pass: true; matchedEvidence: string[]; matchedStrong: string[] }
  | { pass: false; rejectCode: 'NO_PRODUCT_EVIDENCE' | 'GARBAGE_CONTENT' };

/** NFKC (gộp fullwidth/halfwidth) + lowercase — khớp term ổn định cho desc Trung/latin. */
function normForGate(s: string): string {
  return s.normalize('NFKC').toLowerCase();
}

/**
 * Chấm 1 desc qua VOE product gate (thuần, deterministic):
 *  1. Không khớp term bằng chứng sản phẩm nào → NO_PRODUCT_EVIDENCE.
 *  2. Dính marker rác mà KHÔNG có strong action (đập hộp/测评 thật) → GARBAGE_CONTENT.
 *     (旅行好物开箱 = đồ du lịch được đập hộp → strong action cứu; vlog ngắm biển → loại.)
 * matchedStrong trả kèm để tầng chấm điểm Monetization Fit tái dùng (không quét 2 lần).
 */
export function evaluateProductGate(desc: string, gate: ScoutProductGate): ProductGateVerdict {
  const d = normForGate(desc);
  const matchedEvidence = gate.productEvidence.filter(
    (t) => t !== '' && d.includes(normForGate(t)),
  );
  if (matchedEvidence.length === 0) return { pass: false, rejectCode: 'NO_PRODUCT_EVIDENCE' };
  const matchedStrong = gate.strongProductActions.filter(
    (t) => t !== '' && d.includes(normForGate(t)),
  );
  const hasGarbage = gate.garbageMarkers.some((t) => t !== '' && d.includes(normForGate(t)));
  if (hasGarbage && matchedStrong.length === 0) {
    return { pass: false, rejectCode: 'GARBAGE_CONTENT' };
  }
  return { pass: true, matchedEvidence, matchedStrong };
}

// --- Monetization Fit scoring (thay vanity metrics khi gate bật) ---------------

/**
 * Điểm Monetization Fit 0–100 từ bằng chứng "review đồ vật" trong desc — KHÔNG
 * dính số view/like:
 *  - Có ≥1 strong action (开箱/测评/实测…) → tier STRONG: 70 + 10/strong-action
 *    thêm (trần 2) + 5/evidence phụ (trần 2) → 70..100.
 *  - Không strong action → tier WEAK: 10/evidence (trần 4) → 0..40.
 * Thiết kế CỐ Ý tạo khoảng trống 40 ↔ 70: video STRONG luôn xếp trên video WEAK
 * bất kể viral bonus (tối đa +20) — "ưu tiên tuyệt đối video review đồ vật".
 */
export function computeFitScore(
  matchedStrong: string[],
  matchedEvidence: string[],
): { fit: number; tier: 'strong' | 'weak' } {
  if (matchedStrong.length > 0) {
    const strongSet = new Set(matchedStrong);
    const others = matchedEvidence.filter((t) => !strongSet.has(t)).length;
    const fit = 70 + Math.min(matchedStrong.length - 1, 2) * 10 + Math.min(others, 2) * 5;
    return { fit: Math.min(fit, 100), tier: 'strong' };
  }
  return { fit: Math.min(matchedEvidence.length, 4) * 10, tier: 'weak' };
}

// --- Dedupe / assemble -------------------------------------------------------

export type KeywordItem = RawSearchItem & { keyword: string };

/**
 * Cùng aweme_id xuất hiện ở nhiều keyword → giữ 1 bản: keyword ĐẦU TIÊN thấy,
 * số liệu MAX (response đến sau thường tươi hơn nhưng không đảm bảo thứ tự).
 */
export function dedupeByAwemeId(items: KeywordItem[]): KeywordItem[] {
  const seen = new Map<string, KeywordItem>();
  for (const item of items) {
    const prev = seen.get(item.awemeId);
    if (!prev) {
      seen.set(item.awemeId, item);
      continue;
    }
    seen.set(item.awemeId, {
      ...prev,
      diggCount: Math.max(prev.diggCount, item.diggCount),
      commentCount: Math.max(prev.commentCount, item.commentCount),
      shareCount: Math.max(prev.shareCount, item.shareCount),
      collectCount:
        prev.collectCount === null && item.collectCount === null
          ? null
          : Math.max(prev.collectCount ?? 0, item.collectCount ?? 0),
      createTimeSec: prev.createTimeSec ?? item.createTimeSec,
      durationSec: prev.durationSec ?? item.durationSec,
      cover: prev.cover ?? item.cover,
      desc: prev.desc || item.desc,
    });
  }
  return [...seen.values()];
}

/**
 * Toàn bộ pipeline thuần: dedupe → lọc tuổi → VOE gate → sàn l/ph → chấm điểm → sort desc.
 *
 * HAI CHẾ ĐỘ CHẤM ĐIỂM:
 *  - KHÔNG gate (fishing/cooking): điểm viral thuần (likes/phút) — hành vi cũ nguyên vẹn.
 *  - CÓ gate (pov-review): điểm = Monetization Fit (0–100, QUYẾT ĐỊNH) + viral bonus
 *    (0–20, chỉ xếp hạng phụ). Video review đồ vật rõ (FIT_STRONG ≥70) LUÔN đứng trên
 *    video bằng chứng yếu (FIT_WEAK ≤40+20=60) dù view/like cao đến mấy — vanity
 *    metrics KHÔNG còn quyết định thứ hạng. FIT_STRONG được miễn sàn likes/phút
 *    (review tốt mới nổi không bị giết vì chưa viral); FIT_WEAK chịu sàn như cũ.
 */
export function buildCandidates(
  items: KeywordItem[],
  nowMs: number,
  t: ScoutThresholds,
  jobbedIds: ReadonlySet<string>,
  gate?: ScoutProductGate | null,
): { candidates: ScoutCandidate[]; rejected: RejectedCounts } {
  const deduped = dedupeByAwemeId(items);
  const { inWindow, tooOld, tooNew, noTimestamp } = filterByAge(deduped, nowMs, t);
  let belowFloor = 0;
  let noProductEvidence = 0;
  let garbageContent = 0;
  const candidates: ScoutCandidate[] = [];
  for (const item of inWindow) {
    // VOE gate TRƯỚC sàn số liệu: rác nội dung bị loại bất kể độ viral.
    let gateEvidence: string[] | undefined;
    let fitRes: { fit: number; tier: 'strong' | 'weak' } | null = null;
    if (gate) {
      const verdict = evaluateProductGate(item.desc, gate);
      if (!verdict.pass) {
        if (verdict.rejectCode === 'NO_PRODUCT_EVIDENCE') noProductEvidence += 1;
        else garbageContent += 1;
        continue;
      }
      gateEvidence = verdict.matchedEvidence;
      fitRes = computeFitScore(verdict.matchedStrong, verdict.matchedEvidence);
    }
    const scored = computeScore(item, nowMs, t);
    // Sàn likes/phút: FIT_STRONG miễn (Monetization Fit đè vanity); còn lại như cũ.
    if (scored.likesPerMinute < t.floorLikesPerMinute && fitRes?.tier !== 'strong') {
      belowFloor += 1;
      continue;
    }
    let score = scored.score;
    let reason = scored.reason;
    let baseSignals: ScoutSignal[] = scored.signals;
    let monetizationFit: number | undefined;
    if (fitRes) {
      const viralBonus =
        Math.round(Math.min(scored.likesPerMinute / t.refLikesPerMinute, 1) * 20 * 10) / 10;
      score = Math.round((fitRes.fit + viralBonus) * 10) / 10;
      monetizationFit = fitRes.fit;
      const evidenceShown = (gateEvidence ?? []).slice(0, 3).join(', ');
      reason = `Monetization Fit ${fitRes.fit}/100 (${evidenceShown}) + viral ${viralBonus}/20 — ${scored.reason}`;
      baseSignals = [fitRes.tier === 'strong' ? 'FIT_STRONG' : 'FIT_WEAK', ...scored.signals];
    }
    const alreadyJobbed = jobbedIds.has(item.awemeId);
    const signals: ScoutSignal[] = alreadyJobbed ? [...baseSignals, 'ALREADY_JOBBED'] : baseSignals;
    // createTimeSec non-null: filterByAge đã loại noTimestamp.
    const createdSec = item.createTimeSec ?? 0;
    candidates.push({
      awemeId: item.awemeId,
      url: `https://www.douyin.com/video/${item.awemeId}`,
      desc: item.desc,
      createdAt: new Date(createdSec * 1000).toISOString(),
      capturedAt: new Date(nowMs).toISOString(),
      ageMinutes: Math.round((ageMinutesOf(item, nowMs) ?? 0) * 10) / 10,
      diggCount: item.diggCount,
      commentCount: item.commentCount,
      shareCount: item.shareCount,
      collectCount: item.collectCount,
      durationSec: item.durationSec,
      cover: item.cover,
      author: item.author,
      keyword: item.keyword,
      likesPerMinute: scored.likesPerMinute,
      score,
      signals,
      reason,
      alreadyJobbed,
      ...(gateEvidence ? { gateEvidence } : {}),
      ...(monetizationFit !== undefined ? { monetizationFit } : {}),
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  return {
    candidates,
    rejected: { tooOld, tooNew, noTimestamp, belowFloor, noProductEvidence, garbageContent },
  };
}

// --- Rescan delta (Round 3 — schema sẵn từ ngày 1) ---------------------------

/**
 * Ghép candidates lượt quét mới với snapshot trước theo aweme_id → Δlike/Δt =
 * velocity THẬT (không giả định tuyến tính). Video mới xuất hiện giữ nguyên
 * (không delta); video biến mất khỏi lượt mới không được thêm lại.
 */
export function computeRescanDeltas(prev: ScoutSnapshot, curr: ScoutCandidate[]): ScoutCandidate[] {
  const prevById = new Map(prev.candidates.map((c) => [c.awemeId, c]));
  return curr.map((c) => {
    const p = prevById.get(c.awemeId);
    if (!p) return c;
    const deltaMinutes = (Date.parse(c.capturedAt) - Date.parse(p.capturedAt)) / 60_000;
    if (!Number.isFinite(deltaMinutes) || deltaMinutes < 1) return c;
    const trueLpm = (c.diggCount - p.diggCount) / deltaMinutes;
    return {
      ...c,
      delta: {
        prevCapturedAt: p.capturedAt,
        prevDiggCount: p.diggCount,
        deltaMinutes: Math.round(deltaMinutes * 10) / 10,
        trueLikesPerMinute: Math.round(trueLpm * 10) / 10,
      },
    };
  });
}

// --- Report ------------------------------------------------------------------

const STATUS_LABEL: Record<ScoutSnapshot['status'], string> = {
  OK: 'OK',
  PARTIAL_CAPTCHA:
    'PARTIAL_CAPTCHA — Douyin chặn CAPTCHA giữa chừng. Chạy `pnpm ent:douyin-login` giải tay rồi quét lại (phần đã quét vẫn được giữ).',
  PARTIAL_NAV_FAILED: 'PARTIAL_NAV_FAILED — một số keyword không mở được trang.',
};

function mdEscape(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** Report markdown cho Operator — KHÔNG chứa absolute path máy. */
export function renderReportMd(snap: ScoutSnapshot, topN: number): string {
  const gateNote = snap.productGateApplied
    ? ` · 🛡 không-sản-phẩm ${snap.rejectedCounts.noProductEvidence} · rác nội dung ${snap.rejectedCounts.garbageContent}`
    : '';
  const lines: string[] = [
    `# Trend Scout — ${snap.runId}`,
    '',
    `- Niche: **${snap.niche}**${snap.subNiche ? ` · ngách con: **${snap.subNiche.label}** (${snap.subNiche.id})` : ''}`,
    `- Thời gian: ${snap.startedAt} → ${snap.finishedAt}`,
    `- Keywords: ${snap.keywordsCompleted}/${snap.keywords.length} hoàn thành (${snap.keywords.join(', ')})`,
    `- Trạng thái: ${STATUS_LABEL[snap.status]}`,
    `- Ứng viên: **${snap.candidates.length}** (loại: quá cũ ${snap.rejectedCounts.tooOld} · quá mới ${snap.rejectedCounts.tooNew} · thiếu timestamp ${snap.rejectedCounts.noTimestamp} · dưới sàn ${snap.rejectedCounts.belowFloor}${gateNote}) · DOM-only không số liệu: ${snap.domOnlyIds.length}`,
    '',
    snap.productGateApplied
      ? '> Điểm = **Monetization Fit 0–100** (bằng chứng review đồ vật — QUYẾT ĐỊNH) + viral bonus 0–20 (xếp hạng phụ). Vanity metrics không còn quyết định thứ hạng; viral chỉ là ƯỚC LƯỢNG tuyến tính.'
      : '> Điểm single-snapshot là ƯỚC LƯỢNG (giả định like tăng tuyến tính theo tuổi).',
    '',
    '| # | Điểm | Tuổi | Likes | L/phút | Cmt | Tín hiệu | Video |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const [i, c] of snap.candidates.slice(0, topN).entries()) {
    const jobbed = c.alreadyJobbed ? ' 🛑đã có job' : '';
    const desc = mdEscape(c.desc.slice(0, 60)) || '(không có mô tả)';
    lines.push(
      `| ${i + 1} | ${c.score} | ${Math.round(c.ageMinutes)}ph | ${formatCount(c.diggCount)} | ${c.likesPerMinute} | ${formatCount(c.commentCount)} | ${c.signals.join(', ')} | [${desc}](${c.url})${jobbed} |`,
    );
  }
  lines.push(
    '',
    `_Lý do từng video nằm trong snapshot JSON (field \`reason\`). Dán URL vào ô "Tải link" lane Giải trí — hệ thống tự chặn trùng (409)._`,
    '',
  );
  return lines.join('\n');
}
