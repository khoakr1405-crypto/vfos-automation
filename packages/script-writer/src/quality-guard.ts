import type { ScriptOutput } from './types.js';

/**
 * Phrases that flag the script as too "AI-promotional" or "TV-ad sến".
 * Case-insensitive substring match on the rendered `full_script`.
 * Some entries are flagged on the SECOND occurrence (e.g. "thực sự" mild,
 * "đỉnh thật sự" idiomatic) — those go in `softBannedPhrases`.
 */
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

export interface BannedHit {
  phrase: string;
  block_id: string | null;
  hard: boolean;
}

export interface QualityReport {
  banned_phrases_found: BannedHit[];
  hook_consistent: boolean;
  cta_consistent: boolean;
  word_count: number;
  word_count_target: number;
  word_count_within_target: boolean;
  warnings: string[];
  passed: boolean;
}

export function buildQualityReport(output: ScriptOutput, duration_target_s: number): QualityReport {
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

  const firstHookBlock = output.blocks.find((b) => b.intent === 'HOOK');
  const lastCtaBlock = [...output.blocks].reverse().find((b) => b.intent === 'CTA');
  const hook_consistent = firstHookBlock ? normEq(output.hook, firstHookBlock.line) : false;
  const cta_consistent = lastCtaBlock ? normEq(output.cta, lastCtaBlock.line) : false;

  const wordCount = fullScript.trim().split(/\s+/).filter(Boolean).length;
  const wordTarget = Math.round(duration_target_s * 2.8);
  const ratio = wordCount / wordTarget;
  // Tightened to ±5% (was ±20%): matches the [min_words, max_words] window
  // we send to the model in buildUserPayload. Catches underwriting where
  // a generic ±20% bound was too loose to be useful.
  const word_count_within_target = ratio >= 0.95 && ratio <= 1.05;

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
    warnings.push(
      `[WORD_COUNT] ${wordCount} words vs target ${wordTarget} ` +
        `(${sign}${deltaPct}%, outside ±5% window)`,
    );
  }

  const passed =
    hits.filter((h) => h.hard).length === 0 &&
    hook_consistent &&
    cta_consistent &&
    word_count_within_target;

  return {
    banned_phrases_found: hits,
    hook_consistent,
    cta_consistent,
    word_count: wordCount,
    word_count_target: wordTarget,
    word_count_within_target,
    warnings,
    passed,
  };
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
