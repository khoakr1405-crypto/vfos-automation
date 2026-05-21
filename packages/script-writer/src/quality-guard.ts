import type { BlockIntent, ScriptBlock, ScriptOutput } from './types.js';

export interface WordBudget {
  target: number;
  min: number;
  max: number;
  tolerance: number;
}

/**
 * Single source of truth for the word-count window. Used by quality-guard,
 * the writer payload, and the extender payload so all three stay in sync.
 *
 * Tolerance is band-aware: short videos (target <130, roughly ≤46s) get a
 * wider ±8% window. The extender adds words in absolute chunks (~25-40),
 * which lands inside a tight ±5% window for medium/long targets but pushes
 * past the upper bound when the target itself is small. Widening the
 * window for short videos prevents that overshoot from failing the guard.
 */
export function computeWordBudget(durationTargetS: number): WordBudget {
  const target = Math.round(durationTargetS * 2.8);
  const tolerance = target < 130 ? 0.08 : 0.05;
  const min = Math.round(target * (1 - tolerance));
  const max = Math.round(target * (1 + tolerance));
  return { target, min, max, tolerance };
}

/* ── Block-level timing budget ──────────────────────────────────────────────
 *
 * Per-block words_per_second is intent-specific. Calibration:
 * - Global script target uses 2.8 wps (computeWordBudget above) — matches
 *   nominal Vietnamese TTS pacing at speed 1.3 for brand voice + Eleven v3.
 * - Block caps align with that 2.8 reference for HOOK/KITCHEN/FILLER so the
 *   writer's pacing rule and per-block cap don't contradict each other.
 *   Overshoot ≤2 từ → minor (absorbed by Voice Sync overflow_minor ≤0.5s).
 *   Overshoot >2 từ → major (fails the guard).
 * - CTA uses 2.4 wps — CTA windows are often 3s and Voice Sync cannot
 *   rescue overflow that exceeds speed-up cap 1.4. ANY CTA overflow is
 *   major. yt_007 b7 (17 từ in 3s, 5.84s even at speed 1.4) is the failure
 *   this prevents.
 * - TRANSITION uses 2.2 wps — these are bridge lines; longer wears thin.
 *
 * Empirical data from yt_005/006/007 voice_sync manifests at speed 1.3:
 * observed effective wps is 2.5–3.0 for windows ≥6s and 3.0–3.85 for short
 * blocks. So a 2.8 cap leaves room for the short-window overdrive while
 * still blocking the b7-style 5×-budget catastrophe.
 */
const BLOCK_WPS_BY_INTENT: Record<BlockIntent, number> = {
  HOOK: 2.8,
  KITCHEN: 2.8,
  FILLER: 2.6,
  TRANSITION: 2.2,
  CTA: 2.4,
  SILENT: 0,
};

export interface BlockBudget {
  intent: BlockIntent;
  window_duration_s: number;
  /** Hard upper bound — exceeding this triggers a block-level violation. */
  max_words: number;
  /** Soft target for prompts. Lower than max_words to keep prose comfortable. */
  recommended_words: number;
}

export function computeBlockBudget(intent: BlockIntent, windowDurationS: number): BlockBudget {
  const wps = BLOCK_WPS_BY_INTENT[intent] ?? 2.4;
  const window = Math.max(0, windowDurationS);
  const maxWords = intent === 'SILENT' ? 0 : Math.max(0, Math.floor(window * wps));
  const recommended = intent === 'SILENT' ? 0 : Math.max(0, Math.floor(window * (wps - 0.3)));
  return {
    intent,
    window_duration_s: Number.parseFloat(window.toFixed(3)),
    max_words: maxWords,
    recommended_words: recommended,
  };
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/* ── Aggregate block capacity + budget reconciliation ──────────────────────
 *
 * The duration-based target (duration × 2.8) was originally derived from a
 * 170 WPM TTS pacing assumption that treats the whole video as uniformly
 * voiced at the same wps. Real timelines mix intents with intent-specific
 * caps (CTA 2.4 wps, TRANSITION 2.2, SILENT 0). When the duration target
 * exceeds the sum of per-block caps, no script can satisfy both — the model
 * either violates block caps or pads with banned phrases ("vô cùng" leak
 * observed on yt_007 v6 extender). Reconciliation cuts the global target
 * down to the largest value that's actually achievable across the timeline.
 */

export interface AggregateCapacity {
  /** Blocks that contribute voice (cap > 0 AND has narration or could). */
  voiced_block_count: number;
  /** Blocks excluded from capacity: SILENT, empty-line, or intent with 0 cap. */
  skipped_block_count: number;
  /** Sum of per-block max_words across voiced blocks. */
  aggregate_max_words: number;
  /** Sum of per-block recommended_words across voiced blocks. */
  aggregate_recommended_words: number;
}

/** Block descriptor accepted by capacity computation. Works for both the
 *  input scene (mapped to intent) and the output ScriptBlock. */
export interface CapacityBlock {
  intent: BlockIntent;
  window_start_s: number;
  window_end_s: number;
  /** When present and empty (after trim), the block is treated as no-voice. */
  line?: string;
}

export function computeAggregateCapacity(blocks: ReadonlyArray<CapacityBlock>): AggregateCapacity {
  let aggregate_max_words = 0;
  let aggregate_recommended_words = 0;
  let voiced_block_count = 0;
  let skipped_block_count = 0;
  for (const b of blocks) {
    const window = b.window_end_s - b.window_start_s;
    const budget = computeBlockBudget(b.intent, window);
    const lineIsEmpty = b.line !== undefined && b.line.trim() === '';
    if (budget.max_words <= 0 || lineIsEmpty) {
      skipped_block_count += 1;
      continue;
    }
    aggregate_max_words += budget.max_words;
    aggregate_recommended_words += budget.recommended_words;
    voiced_block_count += 1;
  }
  return {
    voiced_block_count,
    skipped_block_count,
    aggregate_max_words,
    aggregate_recommended_words,
  };
}

/**
 * Fraction of aggregate cap the writer should aim for. 10% headroom keeps
 * prose natural — not every block lands at exact cap, and Voice Sync needs
 * a little buffer for TTS variance. Empirical: yt_007 v6 pass1 landed at
 * 87.6% of aggregate cap naturally (92/105), so 0.90 matches the model's
 * actual sweet spot when given strict block caps.
 */
const TIMELINE_FILL_RATIO = 0.9;

export type BudgetMode = 'duration' | 'timeline_aware';

export interface ReconciledWordBudget extends WordBudget {
  /** 'duration' = duration-based target fits inside aggregate cap headroom;
   *  'timeline_aware' = target was reduced to fit aggregate cap. */
  mode: BudgetMode;
  /** Original duration × 2.8 target, before reconciliation. */
  duration_based_target: number;
  /** Sum of per-block max_words. Hard physical ceiling. */
  aggregate_block_cap: number;
  /** Non-null when mode === 'timeline_aware', explaining the adjustment. */
  target_adjustment_reason: string | null;
}

/**
 * Reconcile a duration-based global target with the aggregate block cap.
 * - If duration target ≤ aggregate × FILL_RATIO: keep duration-based.
 * - Else: drop target to floor(aggregate × FILL_RATIO) so the writer is
 *   not asked for more than the timeline can hold.
 *
 * Min/max derive from the reconciled target via the same band-aware
 * tolerance as `computeWordBudget`, then `max` is clamped at aggregate
 * cap so the upper bound is never physically impossible.
 */
export function reconcileWordBudget(
  durationTargetS: number,
  capacity: AggregateCapacity,
): ReconciledWordBudget {
  const durationBased = computeWordBudget(durationTargetS);
  const aggregateCap = capacity.aggregate_max_words;
  const aggregateAim = Math.floor(aggregateCap * TIMELINE_FILL_RATIO);

  let target = durationBased.target;
  let mode: BudgetMode = 'duration';
  let adjustmentReason: string | null = null;

  if (aggregateCap > 0 && durationBased.target > aggregateAim) {
    target = aggregateAim;
    mode = 'timeline_aware';
    adjustmentReason = `duration-based target ${durationBased.target} vượt ${(TIMELINE_FILL_RATIO * 100).toFixed(0)}% aggregate cap ${aggregateCap}; reconciled to ${aggregateAim} (≤cap-${aggregateCap - aggregateAim} từ buffer)`;
  }

  const tolerance = target < 130 ? 0.08 : 0.05;
  const min = Math.max(0, Math.round(target * (1 - tolerance)));
  // Clamp max so the upper bound is never above what the timeline physically allows.
  const max =
    aggregateCap > 0
      ? Math.min(aggregateCap, Math.round(target * (1 + tolerance)))
      : Math.round(target * (1 + tolerance));

  return {
    target,
    min,
    max,
    tolerance,
    mode,
    duration_based_target: durationBased.target,
    aggregate_block_cap: aggregateCap,
    target_adjustment_reason: adjustmentReason,
  };
}

export type BlockViolationSeverity = 'minor' | 'major';

export interface BlockBudgetViolation {
  block_id: string;
  intent: BlockIntent;
  window_duration_s: number;
  max_words: number;
  actual_words: number;
  overflow_words: number;
  severity: BlockViolationSeverity;
  reason: string;
}

/**
 * Per-block word budget enforcement. SILENT blocks with empty line are not
 * violations. CTA overflow is ALWAYS major because the 3s-window failure
 * mode (yt_007 b7) cannot be saved by Voice Sync remediation. Other intents
 * tolerate overflow ≤2 words as minor — sync layer's overflow_minor
 * envelope (≤0.5s) absorbs that range.
 */
export function checkBlockBudgets(output: ScriptOutput): BlockBudgetViolation[] {
  const violations: BlockBudgetViolation[] = [];
  for (const block of output.blocks) {
    if (block.intent === 'SILENT' && block.line.trim() === '') continue;
    const window = block.window_end_s - block.window_start_s;
    const budget = computeBlockBudget(block.intent, window);
    const actual = countWords(block.line);
    if (actual <= budget.max_words) continue;
    const overflow = actual - budget.max_words;
    const severity: BlockViolationSeverity =
      block.intent === 'CTA' || overflow > 2 ? 'major' : 'minor';
    violations.push({
      block_id: block.block_id,
      intent: block.intent,
      window_duration_s: Number.parseFloat(window.toFixed(3)),
      max_words: budget.max_words,
      actual_words: actual,
      overflow_words: overflow,
      severity,
      reason:
        block.intent === 'CTA'
          ? `CTA ${actual} từ trong window ${window.toFixed(1)}s vượt cap ${budget.max_words} — Voice Sync không cứu được`
          : `${block.intent} ${actual} từ vượt cap ${budget.max_words} +${overflow}`,
    });
  }
  return violations;
}

/** Helper for prompts: per-block budget table for inclusion in payload. */
export function buildBlockBudgetTable(
  blocks: ReadonlyArray<
    Pick<ScriptBlock, 'block_id' | 'intent' | 'window_start_s' | 'window_end_s'>
  >,
): string {
  const lines: string[] = [];
  lines.push('| block_id | intent     | window  | max_words | recommended |');
  lines.push('|----------|------------|---------|-----------|-------------|');
  for (const b of blocks) {
    const window = b.window_end_s - b.window_start_s;
    const budget = computeBlockBudget(b.intent, window);
    lines.push(
      `| ${b.block_id.padEnd(8)} | ${b.intent.padEnd(10)} | ${`${window.toFixed(1)}s`.padEnd(7)} | ${String(budget.max_words).padEnd(9)} | ${String(budget.recommended_words).padEnd(11)} |`,
    );
  }
  return lines.join('\n');
}

const HARD_BANNED_PHRASES = [
  'tuyệt vời',
  'đáng kinh ngạc',
  'không thể bỏ qua',
  'kinh điển',
  'chắc chắn cần',
  'cho mọi nhà',
  'mua ngay',
  'đẳng cấp',
  'vô cùng',
  'siêu phẩm',
  'must-have',
  'must have',
] as const;

const SOFT_BANNED_PHRASES = ['thực sự', 'thật sự', 'đỉnh cao', 'đỉnh thật sự'] as const;

/**
 * AI-ad-copy phrases that should NEVER appear in extended scripts.
 * Unlike SOFT_BANNED (which allows ×1 occurrence), these flag on ANY
 * occurrence — they're patterns the Extender Pass tends to generate when
 * padding for word count. Soft (warning only, does not fail `passed`)
 * so a single occurrence in operator-edited prose isn't a hard block.
 */
const AD_COPY_PHRASES = ['đảm bảo', 'đừng bỏ lỡ', 'không thể thiếu'] as const;

export interface BannedHit {
  phrase: string;
  block_id: string | null;
  hard: boolean;
}

/**
 * Tiered quality classification:
 * - `pass`     — all guards clean. Pipeline continues with no caveat.
 * - `near_pass`— ONLY word_count_within_target fails, AND the deviation is
 *                inside the conservative near-pass envelope (≤6 từ ngoài
 *                window AND ≤12% lệch khỏi target), AND no banned/leak hit.
 *                Pipeline continues; warning logged.
 * - `fail`     — any disqualifying condition: banned phrase, hook/CTA
 *                inconsistency, CTA rewrite leak, OR word count outside
 *                even the near-pass envelope, OR multiple checks failing.
 *                Pipeline must stop or retry.
 */
export type QualityStatus = 'pass' | 'near_pass' | 'fail';

/** Conservative near-pass envelope. Word count outside the pass window but
 *  still within these bounds is "technically off, content-clean" — pipeline
 *  proceeds with a warning instead of failing hard. Both caps must hold. */
const NEAR_PASS_ABSOLUTE_WORDS = 6;
const NEAR_PASS_RELATIVE_TOLERANCE = 0.12;

export interface QualityReport {
  banned_phrases_found: BannedHit[];
  hook_consistent: boolean;
  cta_consistent: boolean;
  cta_preserved: boolean | null;
  word_count: number;
  word_count_target: number;
  word_count_within_target: boolean;
  /** 'duration' = global target derived from duration × 2.8, used as-is.
   *  'timeline_aware' = target was reduced to fit aggregate block cap. */
  budget_mode: BudgetMode;
  /** Original duration × 2.8 before any reconciliation. */
  duration_based_target: number;
  /** Sum of per-block max_words across voiced blocks — physical ceiling. */
  aggregate_block_cap: number;
  /** Non-null when budget_mode === 'timeline_aware': why target was reduced. */
  target_adjustment_reason: string | null;
  /** Per-block timing budget violations. Any major → fail; minor → degrades
   *  pass to near_pass within existing envelope. SILENT blocks with empty
   *  line are exempt. */
  block_budget_violations: BlockBudgetViolation[];
  warnings: string[];
  /** Tiered classification — authoritative signal for orchestration. */
  quality_status: QualityStatus;
  /** Human-readable explanation when `quality_status === 'near_pass'`. */
  near_pass_reason: string | null;
  /** Strict pass — `true` iff `quality_status === 'pass'`. Kept for
   *  backward-compat with code that only knows the binary signal. */
  passed: boolean;
}

export interface QualityReportContext {
  /** Pass-1 CTA — when provided, extender output must contain it verbatim. */
  pass1_cta?: string;
}

export function buildQualityReport(
  output: ScriptOutput,
  duration_target_s: number,
  context: QualityReportContext = {},
): QualityReport {
  const fullScript = output.full_script;
  const fullLower = fullScript.toLowerCase();

  const hits: BannedHit[] = [];

  for (const p of HARD_BANNED_PHRASES) {
    if (fullLower.includes(p)) {
      hits.push({ phrase: p, block_id: findBlockContaining(output, p), hard: true });
    }
  }

  for (const p of SOFT_BANNED_PHRASES) {
    const occurrences = countOccurrences(fullLower, p);
    if (occurrences >= 2) {
      hits.push({
        phrase: `${p} (×${occurrences})`,
        block_id: findBlockContaining(output, p),
        hard: false,
      });
    }
  }

  for (const p of AD_COPY_PHRASES) {
    const occurrences = countOccurrences(fullLower, p);
    if (occurrences >= 1) {
      hits.push({
        phrase: occurrences > 1 ? `${p} (×${occurrences})` : p,
        block_id: findBlockContaining(output, p),
        hard: false,
      });
    }
  }

  const firstHookBlock = output.blocks.find((b) => b.intent === 'HOOK');
  const lastCtaBlock = [...output.blocks].reverse().find((b) => b.intent === 'CTA');
  const hook_consistent = firstHookBlock ? normEq(output.hook, firstHookBlock.line) : false;
  const cta_consistent = lastCtaBlock ? normEq(output.cta, lastCtaBlock.line) : false;

  // Extender-only check: pass-1 CTA must survive verbatim inside the new CTA.
  // Substring match after light normalization — extender is allowed to PREPEND
  // a soft sentence but never to rewrite or paraphrase the pass-1 CTA.
  let cta_preserved: boolean | null = null;
  if (context.pass1_cta !== undefined) {
    const normalizedPass1 = normalizeForContainment(context.pass1_cta);
    const normalizedCurrent = normalizeForContainment(output.cta);
    cta_preserved = normalizedCurrent.includes(normalizedPass1);
  }

  const wordCount = fullScript.trim().split(/\s+/).filter(Boolean).length;
  // Timeline-aware budget: aggregate per-block caps from the actual output
  // blocks (SILENT/empty-line excluded), then reconcile duration target down
  // if it would exceed 90% of aggregate cap. This is the post-pass guard;
  // the Writer/Extender prompts use the same reconciled values upstream.
  const capacity = computeAggregateCapacity(
    output.blocks.map((b) => ({
      intent: b.intent,
      window_start_s: b.window_start_s,
      window_end_s: b.window_end_s,
      line: b.line,
    })),
  );
  const budget = reconcileWordBudget(duration_target_s, capacity);
  const wordTarget = budget.target;
  const ratio = wordTarget > 0 ? wordCount / wordTarget : 1;
  const word_count_within_target = ratio >= 1 - budget.tolerance && ratio <= 1 + budget.tolerance;

  const block_budget_violations = checkBlockBudgets(output);
  const majorBlockViolations = block_budget_violations.filter((v) => v.severity === 'major');
  const minorBlockViolations = block_budget_violations.filter((v) => v.severity === 'minor');

  const warnings: string[] = [];
  for (const h of hits) {
    warnings.push(
      `[${h.hard ? 'BANNED' : 'SOFT-BANNED'}] "${h.phrase}" found${h.block_id ? ` in ${h.block_id}` : ''}`,
    );
  }
  if (!hook_consistent) {
    warnings.push(
      `[HOOK_MISMATCH] hook field (${truncate(output.hook)}) does not match first HOOK block line (${
        firstHookBlock ? truncate(firstHookBlock.line) : '(none)'
      })`,
    );
  }
  if (!cta_consistent) {
    warnings.push(
      `[CTA_MISMATCH] cta field (${truncate(output.cta)}) does not match last CTA block line (${
        lastCtaBlock ? truncate(lastCtaBlock.line) : '(none)'
      })`,
    );
  }
  if (!word_count_within_target) {
    const deltaPct = ((ratio - 1) * 100).toFixed(1);
    const sign = ratio >= 1 ? '+' : '';
    const tolPct = (budget.tolerance * 100).toFixed(0);
    const modeTag = budget.mode === 'timeline_aware' ? ' [timeline_aware]' : '';
    warnings.push(
      `[WORD_COUNT]${modeTag} ${wordCount} words vs target ${wordTarget} ` +
        `(${sign}${deltaPct}%, outside ±${tolPct}% window)`,
    );
  }
  if (cta_preserved === false) {
    warnings.push(
      `[CTA_REWRITE_LEAK] extender rewrote pass-1 CTA. expected substring: ${truncate(
        context.pass1_cta ?? '',
      )} got: ${truncate(output.cta)}`,
    );
  }
  for (const v of block_budget_violations) {
    const tag = v.severity === 'major' ? 'BLOCK_BUDGET_MAJOR' : 'BLOCK_BUDGET_MINOR';
    warnings.push(`[${tag}] ${v.block_id} (${v.intent}, ${v.window_duration_s}s): ${v.reason}`);
  }

  const hardBannedCount = hits.filter((h) => h.hard).length;
  const strictPass =
    hardBannedCount === 0 &&
    hook_consistent &&
    cta_consistent &&
    word_count_within_target &&
    cta_preserved !== false &&
    block_budget_violations.length === 0;

  const { status: quality_status, reason: near_pass_reason } = classifyQualityStatus({
    strictPass,
    word_count_within_target,
    hook_consistent,
    cta_consistent,
    cta_preserved,
    total_hits: hits.length,
    hard_banned_count: hardBannedCount,
    word_count: wordCount,
    budget,
    major_block_violations: majorBlockViolations.length,
    minor_block_violations: minorBlockViolations.length,
  });

  if (quality_status === 'near_pass' && near_pass_reason) {
    warnings.push(`[NEAR_PASS] ${near_pass_reason}`);
  }
  if (budget.mode === 'timeline_aware' && budget.target_adjustment_reason) {
    warnings.push(`[BUDGET_RECONCILED] ${budget.target_adjustment_reason}`);
  }

  return {
    banned_phrases_found: hits,
    hook_consistent,
    cta_consistent,
    cta_preserved,
    word_count: wordCount,
    word_count_target: wordTarget,
    word_count_within_target,
    budget_mode: budget.mode,
    duration_based_target: budget.duration_based_target,
    aggregate_block_cap: budget.aggregate_block_cap,
    target_adjustment_reason: budget.target_adjustment_reason,
    block_budget_violations,
    warnings,
    quality_status,
    near_pass_reason,
    passed: quality_status === 'pass',
  };
}

interface ClassifyInput {
  strictPass: boolean;
  word_count_within_target: boolean;
  hook_consistent: boolean;
  cta_consistent: boolean;
  cta_preserved: boolean | null;
  total_hits: number;
  hard_banned_count: number;
  word_count: number;
  budget: WordBudget;
  major_block_violations: number;
  minor_block_violations: number;
}

/**
 * Decide pass / near_pass / fail.
 *
 * Block-level timing budget interaction:
 * - Any MAJOR block violation (CTA overflow, or non-CTA overflow >2 từ) → fail
 *   regardless of other guards. Voice Sync cannot rescue these and operator
 *   would need to rewrite. Near-pass MUST NOT swallow these.
 * - MINOR block violations (non-CTA, overflow ≤2 từ) are absorbed by Voice
 *   Sync overflow_minor envelope (≤0.5s). They can be near-passed alongside
 *   a small word-count deviation, treated equivalently to a single soft hit.
 *
 * Word-count near-pass envelope: only kicks in when EVERY other guard is
 * clean (including soft-banned, ad-copy hits, block budgets).
 */
function classifyQualityStatus(input: ClassifyInput): {
  status: QualityStatus;
  reason: string | null;
} {
  if (input.major_block_violations > 0) {
    return { status: 'fail', reason: null };
  }
  if (input.strictPass) {
    return { status: 'pass', reason: null };
  }

  const onlyWordCountFails =
    !input.word_count_within_target &&
    input.hook_consistent &&
    input.cta_consistent &&
    input.cta_preserved !== false &&
    input.total_hits === 0 &&
    input.hard_banned_count === 0 &&
    input.minor_block_violations === 0;

  const onlyMinorBlockFails =
    input.word_count_within_target &&
    input.hook_consistent &&
    input.cta_consistent &&
    input.cta_preserved !== false &&
    input.total_hits === 0 &&
    input.hard_banned_count === 0 &&
    input.minor_block_violations > 0;

  if (onlyMinorBlockFails) {
    return {
      status: 'near_pass',
      reason: `${input.minor_block_violations} minor block budget overflow(s) ≤2 từ — Voice Sync overflow_minor envelope absorbs`,
    };
  }

  if (!onlyWordCountFails) {
    return { status: 'fail', reason: null };
  }

  const { word_count, budget } = input;
  const overMax = word_count > budget.max ? word_count - budget.max : 0;
  const underMin = word_count < budget.min ? budget.min - word_count : 0;
  const absoluteDev = Math.max(overMax, underMin);
  const relativeDev = Math.abs(word_count - budget.target) / budget.target;

  if (absoluteDev <= NEAR_PASS_ABSOLUTE_WORDS && relativeDev <= NEAR_PASS_RELATIVE_TOLERANCE) {
    const side = overMax > 0 ? 'over max' : 'under min';
    const relPct = (relativeDev * 100).toFixed(1);
    return {
      status: 'near_pass',
      reason: `word_count=${word_count} ${side} by ${absoluteDev} từ (${relPct}% off target ${budget.target}); all other guards clean`,
    };
  }

  return { status: 'fail', reason: null };
}

function normalizeForContainment(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

function findBlockContaining(output: ScriptOutput, phrase: string): string | null {
  const needle = phrase.toLowerCase();
  for (const b of output.blocks) {
    if (b.line.toLowerCase().includes(needle)) return b.block_id;
  }
  return null;
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let from = 0;
  while (from < haystack.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    count += 1;
    from = idx + needle.length;
  }
  return count;
}

function normEq(a: string, b: string): boolean {
  return a.trim().replace(/\s+/g, ' ') === b.trim().replace(/\s+/g, ' ');
}

function truncate(s: string, n = 50): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
