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
  const lines: string[] = [];
  lines.push('# Yêu cầu viết script');
  lines.push('');
  lines.push(`video_id: ${input.video_id}`);
  lines.push(`platform: ${input.target_platform}`);
  lines.push(`duration_target_s: ${input.duration_target_s}`);
  lines.push(`content_goal: ${input.content_goal}`);
  lines.push(`affiliate_angle: ${input.affiliate_angle}`);
  lines.push(`cta_style: ${input.cta_style}`);
  lines.push(`tone: ${input.tone}`);
  lines.push('');
  lines.push('# Scene timeline');
  for (let i = 0; i < input.scene_timeline.length; i += 1) {
    const s = input.scene_timeline[i];
    if (!s) continue;
    lines.push(
      `- t=${s.window_start_s.toFixed(2)}s..${s.window_end_s.toFixed(2)}s [${s.scene_type}] ${s.visual_summary}${s.notes ? ` (note: ${s.notes})` : ''}`,
    );
  }
  lines.push('');
  lines.push(
    'Sinh script tiếng Việt cho video này, theo đúng schema JSON đã cho. ' +
      'Mỗi scene timeline ở trên map thành 1 block output (cùng window). ' +
      'Tổng số từ ≈ duration_target_s × 2.8.',
  );
  return lines.join('\n');
}
