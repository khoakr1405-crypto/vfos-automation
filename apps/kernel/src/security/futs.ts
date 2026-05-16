export interface FUTSComponents {
  audio_change: number;
  visual_change: number;
  textual_change: number;
  branding_change: number;
  temporal_change: number;
  perceptual_hash_similarity: number;
}

export interface FUTSResult {
  score: number;
  passed: boolean;
  reasons: readonly string[];
  components: FUTSComponents;
}

const WEIGHTS = [0.3, 0.25, 0.2, 0.15, 0.1] as const;

export const FUTS_THRESHOLD = 0.65;
export const PHASH_CEILING = 0.55;

export function computeFUTS(c: FUTSComponents): FUTSResult {
  const raw =
    WEIGHTS[0] * c.audio_change +
    WEIGHTS[1] * c.visual_change +
    WEIGHTS[2] * c.textual_change +
    WEIGHTS[3] * c.branding_change +
    WEIGHTS[4] * c.temporal_change;
  const score = Math.max(0, raw - c.perceptual_hash_similarity);

  const reasons: string[] = [];
  if (c.audio_change < 0.5) reasons.push('audio_too_similar');
  if (c.textual_change < 0.4) reasons.push('text_too_similar');
  if (c.temporal_change < 0.3) reasons.push('cuts_insufficient');
  if (c.branding_change < 0.5) reasons.push('branding_missing');
  if (c.perceptual_hash_similarity > PHASH_CEILING) reasons.push('phash_too_high');
  if (score < FUTS_THRESHOLD) reasons.push('score_below_threshold');

  return {
    score: Number(score.toFixed(3)),
    passed: score >= FUTS_THRESHOLD && c.perceptual_hash_similarity <= PHASH_CEILING,
    reasons,
    components: c,
  };
}
