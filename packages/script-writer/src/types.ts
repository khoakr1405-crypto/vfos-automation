import { z } from 'zod';

export const SceneTypeSchema = z.enum([
  'HOOK',
  'KITCHEN',
  'FILLER',
  'TRANSITION',
  'CTA',
  'OFF_TOPIC',
]);
export type SceneType = z.infer<typeof SceneTypeSchema>;

export const SceneSchema = z.object({
  window_start_s: z.number().nonnegative(),
  window_end_s: z.number().nonnegative(),
  scene_type: SceneTypeSchema,
  visual_summary: z.string().min(1),
  notes: z.string().nullable(),
});
export type Scene = z.infer<typeof SceneSchema>;

export const ScriptWriterInputSchema = z.object({
  video_id: z.string().min(1),
  content_goal: z.string().min(1),
  target_platform: z.enum(['tiktok', 'reels', 'shorts']),
  duration_target_s: z.number().positive(),
  tone: z.string().min(1),
  affiliate_angle: z.string().min(1),
  cta_style: z.string().min(1),
  scene_timeline: z.array(SceneSchema).min(1),
});
export type ScriptWriterInput = z.infer<typeof ScriptWriterInputSchema>;

/* ── Structured output schema (what OpenAI returns) ────────────────────── */

export const BlockIntentSchema = z.enum([
  'HOOK',
  'KITCHEN',
  'FILLER',
  'TRANSITION',
  'CTA',
  'SILENT',
]);
export type BlockIntent = z.infer<typeof BlockIntentSchema>;

export const ScriptBlockSchema = z.object({
  block_id: z.string().min(1),
  window_start_s: z.number().nonnegative(),
  window_end_s: z.number().nonnegative(),
  intent: BlockIntentSchema,
  line: z.string(),
  notes: z.string().nullable(),
});
export type ScriptBlock = z.infer<typeof ScriptBlockSchema>;

export const ScriptOutputSchema = z.object({
  hook: z.string().min(1),
  blocks: z.array(ScriptBlockSchema).min(1),
  cta: z.string().min(1),
  full_script: z.string().min(1),
  writer_notes: z.array(z.string()),
});
export type ScriptOutput = z.infer<typeof ScriptOutputSchema>;

export interface GenerateResult {
  output: ScriptOutput;
  meta: {
    model: string;
    input_tokens: number | null;
    output_tokens: number | null;
    response_id: string;
  };
}
