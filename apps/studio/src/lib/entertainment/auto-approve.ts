// ENT-lane auto-approve applier (Phần 82) — PURE decision, alias-free.
//
// No-Go #3 relaxed by explicit Operator order: on PASS this replaces the human GATE 2
// "Duyệt video" click. The scripts-side gate (scripts/ent-vlog/18-auto-approve.ts) only
// writes auto_approve_report.json; ownership of ent_job.json stays with jobs.ts, so the
// mutation is applied here during the getJobDetail reconcile — but ONLY when every
// existing approvePreview guard already holds. Fail-closed: any non-PASS verdict (incl.
// a missing report) → false → the manual GATE 2 stands. Config OFF → false.
//
// Kept dependency-free (no @/ imports) so the root node:test suite can exercise it
// directly, mirroring the DI shape of facebook-publish.ts.

export type EntAutoApproveVerdict = 'PASS' | 'FAIL' | 'NEEDS_HUMAN';

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
 * ENT auto-approve enabled? Per-lane VFOS_AUTO_APPROVE_ENT overrides the global
 * VFOS_AUTO_APPROVE; default OFF. Mirrors parseAutoApproveConfig (scripts core) — kept
 * as a tiny local copy so the studio bundle never imports the scripts tree.
 */
export function entAutoApproveEnabled(env: Record<string, string | undefined>): boolean {
  return (
    normalizeSwitch(env.VFOS_AUTO_APPROVE_ENT) ?? normalizeSwitch(env.VFOS_AUTO_APPROVE) ?? false
  );
}

export interface EntAutoApproveDeps {
  enabled: boolean;
  /** verdict from auto_approve_report.json; null = no/unreadable report. */
  verdict: EntAutoApproveVerdict | null;
  scriptApproved: boolean;
  voiceRenderDone: boolean;
  previewFileExists: boolean;
  audioPolicyApplied: boolean;
  alreadyPreviewApproved: boolean;
  anyStepRunning: boolean;
}

/**
 * Decide whether to auto-approve the ENT preview. True ONLY when enabled, the AI gate
 * PASSed, it isn't already approved, and every approvePreview guard holds (script gate,
 * voice-render done, preview file present, audio policy applied, nothing running). Any
 * other case → false → human GATE 2 as before. Fail-closed by construction: verdict must
 * be exactly 'PASS'.
 */
export function shouldAutoApproveEntPreview(d: EntAutoApproveDeps): boolean {
  if (!d.enabled) return false;
  if (d.alreadyPreviewApproved) return false;
  if (d.verdict !== 'PASS') return false;
  return (
    d.scriptApproved &&
    d.voiceRenderDone &&
    d.previewFileExists &&
    d.audioPolicyApplied &&
    !d.anyStepRunning
  );
}
