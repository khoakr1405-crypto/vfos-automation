import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { SCRIPT_EXTENDER_SYSTEM_PROMPT } from './extender-prompt.js';
import { computeWordBudget } from './quality-guard.js';
import { SCRIPT_WRITER_SYSTEM_PROMPT } from './system-prompt.js';
import {
  type GenerateResult,
  type ScriptOutput,
  ScriptOutputSchema,
  type ScriptWriterInput,
} from './types.js';

export interface ExpandInput {
  original: ScriptOutput;
  scene_timeline: ScriptWriterInput['scene_timeline'];
  current_word_count: number;
  min_words: number;
  max_words: number;
  target_words: number;
  /** Free-text goal of the video — used for product_mode heuristic. */
  content_goal?: string;
  /** Free-text affiliate angle — used for product_mode heuristic. */
  affiliate_angle?: string;
}

export type ProductMode = 'multi_product' | 'single_or_few' | 'unknown';

/**
 * Detect whether the video is a multi-product listicle or a single-hero demo,
 * from the free-text content_goal / affiliate_angle fields. Used by the
 * extender prompt to forbid count-phrase hallucination ("5 món") on single-
 * product videos. Conservative: returns 'unknown' when ambiguous so the
 * prompt defaults to NO count phrase.
 */
export function detectProductMode(
  content_goal: string | undefined,
  affiliate_angle: string | undefined,
): ProductMode {
  const text = `${content_goal ?? ''} ${affiliate_angle ?? ''}`.toLowerCase();
  if (/\b(hero product|single sku|single product|1 món|1 san pham|1 sản phẩm)\b/.test(text)) {
    return 'single_or_few';
  }
  const countMatch = text.match(/(\d+)\s*(món|đồ|do|sản\s*phẩm|san\s*pham|item|product|sku)\b/);
  if (countMatch?.[1] && Number.parseInt(countMatch[1], 10) >= 2) {
    return 'multi_product';
  }
  return 'unknown';
}

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

  /**
   * Controlled-expansion pass. Takes a pass-1 script that hit the prose bar
   * but underwrites on word count, and expands the thin blocks until the
   * full_script falls within [min_words, max_words]. Reuses ScriptOutputSchema
   * so the result drops straight back through the same quality guard.
   */
  async expand(input: ExpandInput): Promise<GenerateResult> {
    const payload = buildExtenderPayload(input);

    const response = await this.#client.responses.parse({
      model: this.#model,
      // Lower temperature than pass 1 (0.3 vs 0.5) — extender is more
      // constrained (don't touch hook, don't fabricate) so we want less
      // exploration. Length compliance > prose variety here.
      temperature: 0.3,
      input: [
        { role: 'system', content: SCRIPT_EXTENDER_SYSTEM_PROMPT },
        { role: 'user', content: payload },
      ],
      text: {
        format: zodTextFormat(ScriptOutputSchema, 'script_output'),
      },
    });

    const parsed: ScriptOutput | null = response.output_parsed;
    if (!parsed) {
      throw new Error(
        `OpenAI extender returned no parsed output. status=${response.status} refusal=${response.output_text ?? '(none)'}`,
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
  const {
    target: targetWords,
    min: minWords,
    max: maxWords,
  } = computeWordBudget(input.duration_target_s);

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

function buildExtenderPayload(input: ExpandInput): string {
  const { original, scene_timeline, current_word_count, min_words, max_words, target_words } =
    input;
  const delta_min = min_words - current_word_count;
  const delta_max = max_words - current_word_count;
  // Conservative target sits just inside min_words. The extender empirically
  // overshoots when aimed at the middle of the window (yt_007 with target=123
  // landed at 143, +16.3%). Aiming for min+3 gives the model breathing room
  // to overshoot a few words and still land inside the window.
  const conservative_target = min_words + 3;
  const delta_conservative = conservative_target - current_word_count;
  // Detect whether the video is a multi-product listicle or a single-hero
  // demo. KITCHEN block count alone is unreliable (yt_007 has 3 KITCHEN
  // blocks but they are 3 cuts of the SAME hero product). Use content_goal
  // / affiliate_angle text signals instead, with conservative default.
  const product_mode = detectProductMode(input.content_goal, input.affiliate_angle);

  const lines: string[] = [];
  lines.push('# Yêu cầu mở rộng script (Extender Pass)');
  lines.push('');
  lines.push('## Tình trạng hiện tại');
  lines.push(`current_word_count: ${current_word_count}`);
  lines.push(`target_words: ${target_words}`);
  lines.push(`min_words: ${min_words}            # HARD LOWER BOUND`);
  lines.push(`max_words: ${max_words}            # HARD UPPER BOUND`);
  lines.push(
    `conservative_target: ${conservative_target}  # AIM HERE — landing near this is the goal`,
  );
  lines.push(`words_needed_min: +${delta_min}        # cần thêm ít nhất ${delta_min} từ`);
  lines.push(`words_needed_max: +${delta_max}        # KHÔNG vượt quá +${delta_max} từ`);
  lines.push(
    `words_to_add_target: +${delta_conservative}  # ideal addition — aim for this, not more`,
  );
  lines.push(`product_mode: ${product_mode}  # ${describeProductMode(product_mode)}`);
  lines.push('');
  lines.push('## Hook và CTA pass 1 (GIỮ NGUYÊN — KHÔNG SỬA HOOK, KHÔNG REWRITE CTA)');
  lines.push(`hook: ${JSON.stringify(original.hook)}`);
  lines.push(`cta:  ${JSON.stringify(original.cta)}`);
  lines.push('');
  // CANDIDATE flag = block eligible for expansion. KITCHEN/FILLER only;
  // TRANSITION blocks expand poorly (gượng filler) per rule 4, and HOOK/CTA
  // are protected by rule 1/2. Without this restriction the model expands
  // TRANSITION blocks too (observed on yt_007 second test: model added
  // 22 words to two TRANSITION blocks despite rule 4).
  const candidateIntents = new Set(['KITCHEN', 'FILLER']);
  const candidates = original.blocks.filter(
    (b) =>
      candidateIntents.has(b.intent) &&
      Math.round((b.window_end_s - b.window_start_s) * 2.8) -
        b.line.trim().split(/\s+/).filter(Boolean).length >=
        5,
  );
  // Per-block expansion cap: roughly even split of words_to_add_target across
  // candidates, +2 buffer. Prevents the model from dumping all expansion into
  // one or two blocks and overshooting.
  const per_block_cap =
    candidates.length > 0 ? Math.max(5, Math.ceil(delta_conservative / candidates.length) + 2) : 0;
  lines.push(
    `per_block_cap: ${per_block_cap} từ  # max words to add per CANDIDATE block (soft cap, do not exceed by >2)`,
  );
  lines.push('');
  lines.push('## Block pass 1 (kèm budget gợi ý + visual để bám)');
  for (let i = 0; i < original.blocks.length; i += 1) {
    const b = original.blocks[i];
    if (!b) continue;
    const window = b.window_end_s - b.window_start_s;
    const wordsNow = b.line.trim().split(/\s+/).filter(Boolean).length;
    const budget = Math.round(window * 2.8);
    const gap = budget - wordsNow;
    const isCandidate = candidateIntents.has(b.intent) && gap >= 5;
    const flag = isCandidate ? `  <-- CANDIDATE TO EXPAND (max +${per_block_cap} words)` : '';
    const scene = scene_timeline.find(
      (s) => s.window_start_s === b.window_start_s && s.window_end_s === b.window_end_s,
    );
    lines.push(
      `### ${b.block_id} [${b.intent} ${b.window_start_s.toFixed(1)}-${b.window_end_s.toFixed(1)}s] ` +
        `(now=${wordsNow}, budget=${budget}, gap=${gap >= 0 ? `+${gap}` : gap})${flag}`,
    );
    lines.push(`  line:   ${JSON.stringify(b.line)}`);
    if (scene) lines.push(`  visual: ${scene.visual_summary}`);
    lines.push('');
  }
  lines.push('## Yêu cầu output');
  lines.push('1. GIỮ NGUYÊN line block đầu (HOOK) và `hook` field. KHÔNG ĐƯỢC ĐỔI.');
  lines.push(
    '2. **CTA preservation**: line block CTA gốc PHẢI xuất hiện NGUYÊN VĂN trong line block CTA mới. Chỉ được THÊM 1 câu khẳng định mềm phía TRƯỚC (prepend) — không xóa, không paraphrase, không rewrite câu gốc. CTA `field` PHẢI bằng EXACT line block CTA mới.',
  );
  lines.push(
    '3. CHỈ mở rộng block đánh dấu CANDIDATE (chỉ KITCHEN/FILLER). Block không có flag — KỂ CẢ TRANSITION có gap lớn — phải GIỮ NGUYÊN line. TRANSITION mở rộng = gượng = FAIL.',
  );
  lines.push(
    `   Mỗi CANDIDATE block: thêm tối đa ${per_block_cap} từ. KHÔNG dồn tất cả vào 1 block.`,
  );
  lines.push('4. Mỗi câu mở rộng phải bám visual của scene đó, không bịa spec/giá.');
  lines.push('5. KHÔNG dùng cụm cấm trong system prompt.');
  lines.push('6. KHÔNG dùng từ "sản phẩm".');
  lines.push(
    `7. **Anti-count-leak**: \`product_mode=${product_mode}\`. ${describeAntiLeak(product_mode)}`,
  );
  lines.push('8. Giữ nguyên block_id, window_start_s, window_end_s, intent, số lượng block.');
  lines.push(
    `9. **Aim conservative**: nhắm vào ${conservative_target} từ (≈ +${delta_conservative} thêm). Cho phép tới ${max_words} nhưng KHÔNG ép vào trần. Nếu chỉ thêm +${delta_min} đã đạt min thì DỪNG, không cố add thêm.`,
  );
  lines.push(
    `10. Đếm lại từ trong full_script. PHẢI nằm trong [${min_words}, ${max_words}]. Nếu < min: expand thêm block khác. Nếu > max: cắt bớt cụm vừa thêm.`,
  );
  lines.push('11. Ghi writer_notes nói rõ block nào đã expand, từ X→Y từ, lý do thêm câu gì.');
  return lines.join('\n');
}

function describeProductMode(mode: ProductMode): string {
  switch (mode) {
    case 'multi_product':
      return 'multi-product listicle — count phrase OK if khớp đúng số sản phẩm thật trong video';
    case 'single_or_few':
      return 'single hero product — TUYỆT ĐỐI KHÔNG count phrase';
    default:
      return 'không rõ — mặc định KHÔNG dùng count phrase để an toàn';
  }
}

function describeAntiLeak(mode: ProductMode): string {
  switch (mode) {
    case 'multi_product':
      return 'Video có nhiều món — count phrase OK NHƯNG phải khớp ĐÚNG số sản phẩm trong scene_timeline. Đọc visual_summary để đếm số sản phẩm THẬT, không bê số từ ví dụ.';
    case 'single_or_few':
      return 'Video có ÍT sản phẩm/single hero — TUYỆT ĐỐI KHÔNG dùng cụm "X món", "cả X món", "mấy món này", "X cái". Nói "cái này", "món này", "đồ này". Số sản phẩm chỉ suy từ scene_timeline hiện tại, KHÔNG bao giờ từ trí nhớ về clip khác.';
    default:
      return 'Không có signal rõ về số sản phẩm — DEFAULT AN TOÀN: KHÔNG dùng count phrase. Nếu chắc chắn video có nhiều sản phẩm thì phải khớp đúng số trong scene_timeline.';
  }
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
