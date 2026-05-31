import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

export interface ScriptArtifact {
  hook?: string;
  hook3s?: string;
  voiceover?: string;
  voiceoverText?: string;
}

/** Lowercase, strip punctuation, collapse whitespace — for repeat comparison. */
function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:"'`…()\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build the single TTS text from a script artifact's hook + voiceover.
 *
 * Round 56 fix: the script writer often includes the hook as the FIRST sentence
 * of `voiceover`/`voiceoverText`. Blindly concatenating `hook + voiceover` then
 * duplicates the opening line in the generated voiceover. This helper prepends
 * the hook ONLY when the voiceover does not already start with it.
 */
export function buildTtsText(hook: string | undefined, voiceover: string | undefined): string {
  const h = (hook ?? '').trim();
  const v = (voiceover ?? '').trim();
  if (!v) return h;
  if (!h) return v;
  const nh = normalizeForCompare(h);
  const nv = normalizeForCompare(v);
  // If the voiceover already opens with (or already contains) the hook, the hook
  // is redundant — use the voiceover as-is.
  if (nv.startsWith(nh) || nv.includes(nh)) return v;
  return `${h} ${v}`.trim();
}

export function extractCombinedVoiceText(scriptPath: string): string | null {
  if (!existsSync(scriptPath)) return null;
  try {
    const raw = readFileSync(scriptPath, 'utf8');
    const artifact = JSON.parse(raw) as ScriptArtifact;
    // Align with elevenlabs-voiceover-bridge extraction logic (dedupe-aware).
    const hook = artifact.hook3s ?? artifact.hook ?? '';
    const voiceover = artifact.voiceover ?? artifact.voiceoverText ?? '';
    const combined = buildTtsText(hook, voiceover);
    return combined || null;
  } catch {
    return null;
  }
}

/**
 * Detect an unnaturally repeated opening in a voiceover/transcript text.
 * Catches the "hook said twice" failure mode at multiple granularities.
 */
export function detectOpeningRepetition(
  text: string,
  hook?: string,
): { repeated: boolean; reason?: string; phrase?: string } {
  const norm = normalizeForCompare(text);
  if (!norm) return { repeated: false };

  // 1. Hook appears more than once.
  if (hook) {
    const nh = normalizeForCompare(hook);
    if (nh && nh.length >= 10) {
      const occurrences = norm.split(nh).length - 1;
      if (occurrences > 1) {
        return { repeated: true, reason: 'HOOK_REPEATED', phrase: hook.trim() };
      }
    }
  }

  // 2. First sentence repeated immediately after itself.
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length >= 2) {
    const s0 = normalizeForCompare(sentences[0]);
    const s1 = normalizeForCompare(sentences[1]);
    if (s0 && s0.length >= 10 && s0 === s1) {
      return { repeated: true, reason: 'FIRST_SENTENCE_REPEATED', phrase: sentences[0] };
    }
  }

  // 3. Opening n-gram (first 6 words) repeated back-to-back.
  const words = norm.split(' ');
  if (words.length >= 12) {
    const n = 6;
    const firstNgram = words.slice(0, n).join(' ');
    const secondNgram = words.slice(n, n * 2).join(' ');
    if (firstNgram === secondNgram && firstNgram.length >= 12) {
      return {
        repeated: true,
        reason: 'OPENING_NGRAM_REPEATED',
        phrase: words.slice(0, n).join(' '),
      };
    }
  }

  return { repeated: false };
}

export function calculateNormalizedHash(text: string): string {
  // Normalize whitespace to prevent spaces or newlines from shifting the hash
  const normalized = text.trim().replace(/\s+/g, ' ');
  const hash = createHash('sha256').update(normalized, 'utf8').digest('hex');
  return `sha256:${hash}`;
}
