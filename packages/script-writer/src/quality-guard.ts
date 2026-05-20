import type { ScriptOutput } from './types.js';

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
  const budget = computeWordBudget(duration_target_s);
  const wordTarget = budget.target;
  const ratio = wordCount / wordTarget;
  const word_count_within_target = ratio >= 1 - budget.tolerance && ratio <= 1 + budget.tolerance;

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
    warnings.push(
      `[WORD_COUNT] ${wordCount} words vs target ${wordTarget} ` +
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

  const hardBannedCount = hits.filter((h) => h.hard).length;
  const strictPass =
    hardBannedCount === 0 &&
    hook_consistent &&
    cta_consistent &&
    word_count_within_target &&
    cta_preserved !== false;

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
  });

  if (quality_status === 'near_pass' && near_pass_reason) {
    warnings.push(`[NEAR_PASS] ${near_pass_reason}`);
  }

  return {
    banned_phrases_found: hits,
    hook_consistent,
    cta_consistent,
    cta_preserved,
    word_count: wordCount,
    word_count_target: wordTarget,
    word_count_within_target,
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
}

/**
 * Decide pass / near_pass / fail. Near-pass is the narrow exception: every
 * non-word-count guard must be clean (including soft-banned and ad-copy
 * hits, which are warnings in strict mode but disqualifying here), and the
 * word count deviation must fit both an absolute cap and a relative cap.
 */
function classifyQualityStatus(input: ClassifyInput): {
  status: QualityStatus;
  reason: string | null;
} {
  if (input.strictPass) {
    return { status: 'pass', reason: null };
  }

  const onlyWordCountFails =
    !input.word_count_within_target &&
    input.hook_consistent &&
    input.cta_consistent &&
    input.cta_preserved !== false &&
    input.total_hits === 0 &&
    input.hard_banned_count === 0;

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
