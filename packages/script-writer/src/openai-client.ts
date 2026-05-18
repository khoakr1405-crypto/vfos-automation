import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { SCRIPT_WRITER_SYSTEM_PROMPT } from './system-prompt.js';
import {
  type GenerateResult,
  type ScriptOutput,
  ScriptOutputSchema,
  type ScriptWriterInput,
} from './types.js';

export interface ScriptWriterClientConfig {
  apiKey: string;
  model?: string | undefined;
}

const DEFAULT_MODEL = 'gpt-4o-mini';

export class ScriptWriterClient {
  readonly #client: OpenAI;
  readonly #model: string;

  constructor(config: ScriptWriterClientConfig) {
    this.#client = new OpenAI({ apiKey: config.apiKey });
    this.#model = config.model ?? DEFAULT_MODEL;
  }

  async generate(input: ScriptWriterInput): Promise<GenerateResult> {
    const userPayload = buildUserPayload(input);

    const response = await this.#client.responses.parse({
      model: this.#model,
      // Lower temperature (0.5 vs SDK default ~1.0) reduces variance —
      // empirically observed gpt-4o swinging between 88 / 111 / 128 / 134
      // words on identical prompt at default temp. Tightening this gives
      // more reliable adherence to min_words / banned-phrase constraints
      // at the cost of slightly less prose diversity.
      temperature: 0.5,
      input: [
        { role: 'system', content: SCRIPT_WRITER_SYSTEM_PROMPT },
        { role: 'user', content: userPayload },
      ],
      text: {
        format: zodTextFormat(ScriptOutputSchema, 'script_output'),
      },
    });

    const parsed: ScriptOutput | null = response.output_parsed;
    if (!parsed) {
      throw new Error(
        `OpenAI returned no parsed output. status=${response.status} refusal=${response.output_text ?? '(none)'}`,
      );
    }

    return {
      output: parsed,
      meta: {
        model: response.model,
        input_tokens: response.usage?.input_tokens ?? null,
        output_tokens: response.usage?.output_tokens ?? null,
        response_id: response.id,
      },
    };
  }
}

function buildUserPayload(input: ScriptWriterInput): string {
  const targetWords = Math.round(input.duration_target_s * 2.8);
  const minWords = Math.round(targetWords * 0.95);
  const maxWords = Math.round(targetWords * 1.05);

  const lines: string[] = [];
  lines.push('# Yêu cầu viết script');
  lines.push('');
  lines.push(`video_id: ${input.video_id}`);
  lines.push(`platform: ${input.target_platform}`);
  lines.push(`duration_target_s: ${input.duration_target_s}`);
  lines.push(`target_words: ${targetWords}     # full_script must be near this`);
  lines.push(`min_words: ${minWords}            # full_script length is HARD LOWER BOUND`);
  lines.push(`max_words: ${maxWords}            # full_script length is hard upper bound`);
  lines.push(`content_goal: ${input.content_goal}`);
  lines.push(`affiliate_angle: ${input.affiliate_angle}`);
  lines.push(`cta_style: ${input.cta_style}`);
  lines.push(`tone: ${input.tone}`);
  lines.push('');
  lines.push('# Scene timeline (with per-scene word budget guidance)');
  for (let i = 0; i < input.scene_timeline.length; i += 1) {
    const s = input.scene_timeline[i];
    if (!s) continue;
    const window = s.window_end_s - s.window_start_s;
    const budget = perSceneWordBudget(s.scene_type, window);
    lines.push(
      `- t=${s.window_start_s.toFixed(2)}s..${s.window_end_s.toFixed(2)}s ` +
        `[${s.scene_type}] (budget ${budget}) ${s.visual_summary}` +
        `${s.notes ? ` (note: ${s.notes})` : ''}`,
    );
  }
  lines.push('');
  lines.push('# Final check before submitting (MANDATORY)');
  lines.push(
    `1. Count words in full_script. If count < ${minWords}, you MUST expand before submitting.`,
  );
  lines.push('   Expand by: (a) lengthen KITCHEN blocks with 1 more natural sentence,');
  lines.push('              (b) convert any SILENT block whose window ≥3s into FILLER cầu nối,');
  lines.push('              (c) make CTA two short sentences instead of one.');
  lines.push('2. Verify hook field === first HOOK block.line EXACTLY (rule consistency).');
  lines.push('3. Verify cta field === last CTA block.line EXACTLY.');
  lines.push('4. Verify no emoji in full_script.');
  lines.push(
    `5. Verify "sản phẩm" appears at most 1 time across full_script (use "món", "cái này" instead).`,
  );
  lines.push('');
  lines.push(
    `Sinh script tiếng Việt. Tổng số từ trong full_script PHẢI nằm trong [${minWords}, ${maxWords}].`,
  );
  return lines.join('\n');
}

/** Rough word budget hint per scene (model is allowed to deviate ±30%). */
function perSceneWordBudget(sceneType: string, windowSeconds: number): string {
  const w = Math.max(0, windowSeconds);
  switch (sceneType) {
    case 'HOOK':
      return `${Math.round(w * 2.8)} words (12-18 typical)`;
    case 'KITCHEN':
      return `${Math.round(w * 2.8)} words (do NOT skimp)`;
    case 'TRANSITION':
      return `${Math.max(5, Math.round(w * 2.2))} words (1 bridging line)`;
    case 'CTA':
      return `${Math.max(8, Math.round(w * 2.8))} words (1-2 short lines)`;
    case 'OFF_TOPIC':
      return w >= 3
        ? `${Math.max(5, Math.round(w * 1.8))} words (prefer FILLER tease over SILENT)`
        : '0 (SILENT acceptable, window <3s)';
    case 'FILLER':
      return `${Math.max(5, Math.round(w * 2.0))} words`;
    default:
      return `${Math.round(w * 2.5)} words`;
  }
}
