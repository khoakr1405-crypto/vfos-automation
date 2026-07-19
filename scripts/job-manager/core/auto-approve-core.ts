// Auto-Approve core (Phần 82) — PURE logic, no I/O, no fetch.
//
// No-Go #3 relaxed by explicit Operator order (2026-07-18/19): the AI auto-approve
// gate replaces the human approve click on the PASS branch ONLY. FAIL / NEEDS_HUMAN
// keep the job in the existing human review queue. VFOS_AUTO_APPROVE=off restores
// byte-identical manual behavior. This module is the shared contract (verdict shape,
// fail-closed rollup, thresholds, config parse, similarity) used by both lane gates,
// the ENT applier, and the root node:test suite. Keep it dependency-free so it loads
// under tsx --test (precedent: scripts/job-manager/core/market-fit.ts).

export type AutoApproveVerdict = 'PASS' | 'FAIL' | 'NEEDS_HUMAN';
export type CheckStatus = 'PASS' | 'FAIL' | 'NEEDS_HUMAN';

export interface AutoApproveCheck {
  /** stable key, e.g. 'hook_first3s', 'product_match_guard8_visual'. */
  key: string;
  status: CheckStatus;
  /** natural-scale numeric score (0–10 for perceptual, 0–1 for match); optional. */
  score?: number;
  /** threshold the score was compared against (for the report). */
  threshold?: number;
  /** human-readable reasons the model / check gave. */
  reasons: string[];
}

export interface AutoApproveReport {
  reportVersion: 'v1';
  lane: 'review' | 'ent';
  jobId: string;
  runId: string;
  verdict: AutoApproveVerdict;
  /** holistic 0–10 watchability score assembled by the gate. */
  overallScore: number;
  checks: AutoApproveCheck[];
  framesAnalyzed: Array<{ index: number; timestampSec: number; path: string }>;
  model: string;
  apiCalled: boolean;
  costEstimateUsd: number;
  approvedBy: 'auto_gate';
  generatedAt: string;
}

/** Below this holistic score, hold for a human even if no check hard-failed. */
export const MIN_OVERALL_SCORE = 7;

/** Threshold table — single source of truth for both lanes' gates. */
export const AUTO_APPROVE_THRESHOLDS = {
  /** perceptual 0–10 checks: >= pass → PASS, else NEEDS_HUMAN (never auto-FAIL soft). */
  hookFirst3s: 6,
  captionLegibility: 6,
  /** GUARD 8 visual match 0–1: >= pass → PASS, < fail → FAIL, between → NEEDS_HUMAN. */
  productMatchPass: 0.75,
  productMatchFail: 0.5,
  /** voice-vs-script STT token overlap 0–1. */
  sttOverlap: 0.7,
  /** audio: dead-air run (seconds) inside voiced region that fails the clip. */
  deadAirMaxSec: 1.5,
} as const;

/**
 * Status for a soft perceptual score (0–10): at/above threshold PASS, below →
 * NEEDS_HUMAN. Soft checks NEVER auto-FAIL — a weak-but-not-broken clip escalates
 * to a human rather than being thrown away.
 */
export function statusFromSoftScore(score: number, passThreshold: number): CheckStatus {
  if (!Number.isFinite(score)) return 'NEEDS_HUMAN';
  return score >= passThreshold ? 'PASS' : 'NEEDS_HUMAN';
}

/**
 * Status for a banded score (e.g. product match 0–1): PASS at/above passThreshold,
 * FAIL below failThreshold, NEEDS_HUMAN in the ambiguous band. Non-finite → NEEDS_HUMAN.
 */
export function statusFromBandedScore(
  score: number,
  passThreshold: number,
  failThreshold: number,
): CheckStatus {
  if (!Number.isFinite(score)) return 'NEEDS_HUMAN';
  if (score >= passThreshold) return 'PASS';
  if (score < failThreshold) return 'FAIL';
  return 'NEEDS_HUMAN';
}

/**
 * FAIL-CLOSED rollup. Any FAIL → FAIL. Otherwise any NEEDS_HUMAN, an empty check
 * set, or overallScore below MIN_OVERALL_SCORE → NEEDS_HUMAN. PASS only when every
 * check PASSed AND the holistic score clears the floor. The gate maps any API error /
 * parse failure / missing input to a NEEDS_HUMAN check before calling this, so an
 * exception can never surface as PASS.
 */
export function rollupVerdict(
  checks: AutoApproveCheck[],
  overallScore: number,
): AutoApproveVerdict {
  if (checks.length === 0) return 'NEEDS_HUMAN';
  if (checks.some((c) => c.status === 'FAIL')) return 'FAIL';
  if (checks.some((c) => c.status === 'NEEDS_HUMAN')) return 'NEEDS_HUMAN';
  if (!Number.isFinite(overallScore) || overallScore < MIN_OVERALL_SCORE) return 'NEEDS_HUMAN';
  return 'PASS';
}

export interface AutoApproveConfig {
  review: boolean;
  ent: boolean;
}

/** on/1/true/yes → true; off/0/false/no/'' → false; unset → undefined. */
function normalizeSwitch(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === '') return false;
  if (['on', '1', 'true', 'yes'].includes(v)) return true;
  if (['off', '0', 'false', 'no'].includes(v)) return false;
  return undefined;
}

/**
 * Parse the auto-approve config from env. Default is OFF for both lanes — the whole
 * gate is a no-op and behavior is byte-identical to manual approval until an Operator
 * explicitly flips it on after the go-live rehearsal. Per-lane overrides win over the
 * global switch.
 */
export function parseAutoApproveConfig(env: Record<string, string | undefined>): AutoApproveConfig {
  const global = normalizeSwitch(env.VFOS_AUTO_APPROVE);
  const review = normalizeSwitch(env.VFOS_AUTO_APPROVE_REVIEW) ?? global ?? false;
  const ent = normalizeSwitch(env.VFOS_AUTO_APPROVE_ENT) ?? global ?? false;
  return { review, ent };
}

const WORD_RE = /[\p{L}\p{N}]+/gu;

function tokenize(text: string): string[] {
  const m = text.toLowerCase().normalize('NFC').match(WORD_RE);
  return m ?? [];
}

/**
 * Coverage of `reference` tokens by `hypothesis` — "how much of the script the voice
 * actually said". Returns the fraction of unique reference tokens present in the
 * hypothesis token set (0..1). Empty reference → 0 (nothing to verify against, treat
 * as unmeasured / fail-closed upstream). Mirrors the word-overlap notion the final-QA
 * STT gate uses.
 */
export function tokenOverlapSimilarity(reference: string, hypothesis: string): number {
  const refTokens = new Set(tokenize(reference));
  if (refTokens.size === 0) return 0;
  const hypTokens = new Set(tokenize(hypothesis));
  let hit = 0;
  for (const t of refTokens) if (hypTokens.has(t)) hit++;
  return hit / refTokens.size;
}
