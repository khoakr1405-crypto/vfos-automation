import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { SCRIPT_EXTENDER_SYSTEM_PROMPT } from './extender-prompt.js';
import {
  computeAggregateCapacity,
  computeBlockBudget,
  countWords,
  reconcileWordBudget,
} from './quality-guard.js';
import { SCRIPT_WRITER_SYSTEM_PROMPT } from './system-prompt.js';
import {
  type BlockIntent,
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
  /** When 'timeline_aware', the model is told NOT to padding-panic for the
   *  old duration target — reconciled target is the real ceiling. */
  budget_mode?: 'duration' | 'timeline_aware';
  /** Original duration × 2.8 — shown for context only, not the aim. */
  duration_based_target?: number;
  /** Sum of per-block max_words — physical ceiling, can't exceed. */
  aggregate_block_cap?: number;
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

/** Map input scene_type → output block intent. OFF_TOPIC has no direct
 *  output intent; writer chooses FILLER or SILENT per system prompt rule 4. */
function intentForSceneType(sceneType: string): BlockIntent {
  switch (sceneType) {
    case 'HOOK':
    case 'KITCHEN':
    case 'FILLER':
    case 'TRANSITION':
    case 'CTA':
      return sceneType;
    default:
      return 'FILLER';
  }
}

function buildUserPayload(input: ScriptWriterInput): string {
  // Compute aggregate capacity from scene_timeline (mapping scene_type → block
  // intent) then reconcile duration target. Writer prompt sees the reconciled
  // numbers, so it doesn't get asked for more words than the timeline can hold.
  const capacityBlocks = input.scene_timeline.map((s) => ({
    intent: intentForSceneType(s.scene_type),
    window_start_s: s.window_start_s,
    window_end_s: s.window_end_s,
  }));
  const capacity = computeAggregateCapacity(capacityBlocks);
  const budget = reconcileWordBudget(input.duration_target_s, capacity);
  const targetWords = budget.target;
  const minWords = budget.min;
  const maxWords = budget.max;

  const lines: string[] = [];
  lines.push('# Yêu cầu viết script');
  lines.push('');
  lines.push(`video_id: ${input.video_id}`);
  lines.push(`platform: ${input.target_platform}`);
  lines.push(`duration_target_s: ${input.duration_target_s}`);
  lines.push(`budget_mode: ${budget.mode}`);
  lines.push(
    `duration_based_target: ${budget.duration_based_target}   # raw duration × 2.8 reference`,
  );
  lines.push(`aggregate_block_cap: ${budget.aggregate_block_cap}    # sum of per-block max_words`);
  lines.push(
    `target_words: ${targetWords}     # RECONCILED target — aim here, not duration target`,
  );
  lines.push(
    `min_words: ${minWords}            # HARD LOWER BOUND (derived from reconciled target)`,
  );
  lines.push(`max_words: ${maxWords}            # HARD UPPER BOUND (clamped at aggregate cap)`);
  if (budget.target_adjustment_reason) {
    lines.push(`budget_adjustment: ${budget.target_adjustment_reason}`);
    lines.push(
      '  → Timeline không đủ chứa duration target. ĐỪNG cố đạt duration_based_target — bám reconciled target.',
    );
  }
  lines.push(`content_goal: ${input.content_goal}`);
  lines.push(`affiliate_angle: ${input.affiliate_angle}`);
  lines.push(`cta_style: ${input.cta_style}`);
  lines.push(`tone: ${input.tone}`);
  lines.push('');
  lines.push('# Per-block timing budget (HARD CAP — KHÔNG được vượt)');
  lines.push('| scene_type | window  | max_words | recommended | severity if over |');
  lines.push('|------------|---------|-----------|-------------|------------------|');
  for (let i = 0; i < input.scene_timeline.length; i += 1) {
    const s = input.scene_timeline[i];
    if (!s) continue;
    const window = s.window_end_s - s.window_start_s;
    const intent = intentForSceneType(s.scene_type);
    const budget = computeBlockBudget(intent, window);
    const severity = s.scene_type === 'CTA' ? 'MAJOR (any over)' : 'minor ≤2 từ, major >2';
    lines.push(
      `| ${s.scene_type.padEnd(10)} | ${`${window.toFixed(1)}s`.padEnd(7)} | ${String(budget.max_words).padEnd(9)} | ${String(budget.recommended_words).padEnd(11)} | ${severity} |`,
    );
  }
  lines.push('');
  lines.push(
    '**Tổng word count đạt target KHÔNG cứu được block vượt cap.** Ưu tiên fit từng block trước, dùng FILLER/expand block còn dư để bù tổng.',
  );
  lines.push(
    '**CTA window ≤3.5s ⇒ 1 câu RẤT NGẮN.** Ví dụ: "Link bio nha", "Ai cần ghé bio nha", "Hợp bếp nhỏ, ghé bio".',
  );
  lines.push('');
  lines.push('# Scene timeline (visual + notes)');
  for (let i = 0; i < input.scene_timeline.length; i += 1) {
    const s = input.scene_timeline[i];
    if (!s) continue;
    const window = s.window_end_s - s.window_start_s;
    const intent = intentForSceneType(s.scene_type);
    const budget = computeBlockBudget(intent, window);
    lines.push(
      `- t=${s.window_start_s.toFixed(2)}s..${s.window_end_s.toFixed(2)}s ` +
        `[${s.scene_type}] (max ${budget.max_words} từ) ${s.visual_summary}` +
        `${s.notes ? ` (note: ${s.notes})` : ''}`,
    );
  }
  lines.push('');
  lines.push('# Final check before submitting (MANDATORY)');
  lines.push('1. Count words PER BLOCK. NO block may exceed its max_words above.');
  lines.push('   CTA over cap = HARD FAIL (Voice Sync cannot rescue 3s window with 17 từ).');
  lines.push(
    `2. Count words in full_script. If count < ${minWords}, expand KITCHEN/FILLER blocks that still have headroom (NOT CTA, NOT blocks at cap).`,
  );
  lines.push('   Expand options: (a) lengthen KITCHEN with 1 natural sentence within its cap,');
  lines.push(
    '                   (b) convert SILENT (window ≥3s) → FILLER cầu nối within FILLER cap,',
  );
  lines.push('                   (c) NEVER push CTA beyond its cap to bump total.');
  lines.push('3. Verify hook field === first HOOK block.line EXACTLY (rule consistency).');
  lines.push('4. Verify cta field === last CTA block.line EXACTLY.');
  lines.push('5. Verify no emoji in full_script.');
  lines.push(
    `6. Verify "sản phẩm" appears at most 1 time across full_script (use "món", "cái này" instead).`,
  );
  lines.push('');
  lines.push(
    `Sinh script tiếng Việt. Tổng số từ trong full_script PHẢI nằm trong [${minWords}, ${maxWords}] VÀ từng block PHẢI ≤ max_words tương ứng.`,
  );
  return lines.join('\n');
}

function buildExtenderPayload(input: ExpandInput): string {
  const { original, scene_timeline, current_word_count, min_words, max_words, target_words } =
    input;
  const delta_min = min_words - current_word_count;
  const delta_max = max_words - current_word_count;
  const conservative_target = min_words + 3;
  const delta_conservative = conservative_target - current_word_count;
  const product_mode = detectProductMode(input.content_goal, input.affiliate_angle);

  // Block-level timing budget: candidate only when the block has real
  // headroom under its own intent-specific cap. KITCHEN/FILLER eligible;
  // CTA is NEVER a candidate here — even if extender wants to prepend a
  // soft sentence, that path is policed by CTA-preservation rule and the
  // block budget cap.
  const candidateIntents = new Set<BlockIntent>(['KITCHEN', 'FILLER']);
  type CandidateMeta = {
    block_id: string;
    intent: BlockIntent;
    window_s: number;
    words_now: number;
    max_words: number;
    headroom: number;
  };
  const candidateMeta: CandidateMeta[] = [];
  for (const b of original.blocks) {
    if (!candidateIntents.has(b.intent)) continue;
    const window = b.window_end_s - b.window_start_s;
    const budget = computeBlockBudget(b.intent, window);
    const wordsNow = countWords(b.line);
    const headroom = budget.max_words - wordsNow;
    if (headroom < 3) continue;
    candidateMeta.push({
      block_id: b.block_id,
      intent: b.intent,
      window_s: window,
      words_now: wordsNow,
      max_words: budget.max_words,
      headroom,
    });
  }

  const total_headroom = candidateMeta.reduce((sum, c) => sum + c.headroom, 0);
  // Per-block cap: prefer even distribution but never exceed each block's
  // own headroom. If total_headroom < delta_conservative we can't reach the
  // target without violating block budgets — extender will underwrite, the
  // quality guard will surface it as fail/near-pass.
  const evenSplit =
    candidateMeta.length > 0 ? Math.ceil(delta_conservative / candidateMeta.length) + 2 : 0;
  const per_block_cap_global = Math.max(5, evenSplit);
  const per_block_caps = new Map(
    candidateMeta.map((c) => [c.block_id, Math.min(c.headroom, per_block_cap_global)]),
  );

  const lines: string[] = [];
  lines.push('# Yêu cầu mở rộng script (Extender Pass)');
  lines.push('');
  lines.push('## Tình trạng hiện tại');
  lines.push(`current_word_count: ${current_word_count}`);
  if (input.budget_mode) lines.push(`budget_mode: ${input.budget_mode}`);
  if (input.duration_based_target !== undefined && input.aggregate_block_cap !== undefined) {
    lines.push(
      `duration_based_target: ${input.duration_based_target}   # raw duration × 2.8 — NOT the aim if reconciled`,
    );
    lines.push(
      `aggregate_block_cap: ${input.aggregate_block_cap}    # physical ceiling across voiced blocks`,
    );
  }
  lines.push(`target_words: ${target_words}     # RECONCILED — this is the aim`);
  lines.push(
    `min_words: ${min_words}            # HARD LOWER BOUND (derived from reconciled target)`,
  );
  lines.push(`max_words: ${max_words}            # HARD UPPER BOUND (clamped at aggregate cap)`);
  if (input.budget_mode === 'timeline_aware') {
    lines.push(
      '⚠ BUDGET RECONCILED: duration target không khả thi với timeline này. ĐỪNG padding-panic để đạt duration target — bám reconciled target/min/max. Underwrite trong cap > vỡ cap.',
    );
  }
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
  lines.push('## Block-level timing budget — HARD CAP');
  lines.push(
    `total_headroom_across_candidates: ${total_headroom} từ  # tổng dư địa của KITCHEN/FILLER candidates`,
  );
  if (total_headroom < delta_min && delta_min > 0) {
    lines.push(
      `⚠ WARNING: total headroom (${total_headroom}) < words_needed_min (+${delta_min}). Có thể KHÔNG đạt min_words mà không vượt block cap. Trong case này: ƯU TIÊN fit từng block, chấp nhận underwrite tổng — KHÔNG được vượt cap để bù tổng.`,
    );
  }
  lines.push('');
  lines.push('## Hook và CTA pass 1 (GIỮ NGUYÊN — KHÔNG SỬA HOOK, KHÔNG REWRITE CTA)');
  lines.push(`hook: ${JSON.stringify(original.hook)}`);
  lines.push(`cta:  ${JSON.stringify(original.cta)}`);
  lines.push('');
  lines.push('## Block pass 1 (kèm block budget cap + visual để bám)');
  for (let i = 0; i < original.blocks.length; i += 1) {
    const b = original.blocks[i];
    if (!b) continue;
    const window = b.window_end_s - b.window_start_s;
    const wordsNow = countWords(b.line);
    const budget = computeBlockBudget(b.intent, window);
    const headroom = budget.max_words - wordsNow;
    const cap = per_block_caps.get(b.block_id);
    const isCandidate = cap !== undefined;
    const flag = isCandidate
      ? `  <-- CANDIDATE TO EXPAND (max +${cap} words, must keep total ≤ ${budget.max_words})`
      : headroom < 0
        ? `  [BLOCK OVER CAP by ${-headroom} — DO NOT EXPAND]`
        : `  [DO NOT EXPAND — ${b.intent} cap reached or near]`;
    const scene = scene_timeline.find(
      (s) => s.window_start_s === b.window_start_s && s.window_end_s === b.window_end_s,
    );
    lines.push(
      `### ${b.block_id} [${b.intent} ${b.window_start_s.toFixed(1)}-${b.window_end_s.toFixed(1)}s] ` +
        `(now=${wordsNow}, cap=${budget.max_words}, headroom=${headroom >= 0 ? `+${headroom}` : headroom})${flag}`,
    );
    lines.push(`  line:   ${JSON.stringify(b.line)}`);
    if (scene) lines.push(`  visual: ${scene.visual_summary}`);
    lines.push('');
  }
  lines.push('## Yêu cầu output');
  lines.push('1. GIỮ NGUYÊN line block đầu (HOOK) và `hook` field. KHÔNG ĐƯỢC ĐỔI.');
  lines.push(
    '2. **CTA preservation + cap**: line block CTA gốc PHẢI xuất hiện NGUYÊN VĂN trong line block CTA mới. CHỈ được prepend NẾU CTA gốc còn headroom (cap - now ≥ 4 từ). NẾU CTA đã đạt/sát cap, GIỮ NGUYÊN, chuyển bù từ vào KITCHEN/FILLER candidate.',
  );
  lines.push(
    '3. CHỈ mở rộng block đánh dấu CANDIDATE (chỉ KITCHEN/FILLER có headroom ≥3). Block có flag `[DO NOT EXPAND]` hoặc `[BLOCK OVER CAP]` — phải GIỮ NGUYÊN line. TRANSITION/HOOK/CTA tại cap = GIỮ NGUYÊN.',
  );
  lines.push(
    `   Mỗi CANDIDATE block: thêm tối đa số từ trong flag ngay cạnh block (per-block cap). Tổng line sau expand KHÔNG được vượt cap riêng của block đó (cột "cap").`,
  );
  lines.push('4. Mỗi câu mở rộng phải bám visual của scene đó, không bịa spec/giá.');
  lines.push('5. KHÔNG dùng cụm cấm trong system prompt.');
  lines.push('6. KHÔNG dùng từ "sản phẩm".');
  lines.push(
    `7. **Anti-count-leak**: \`product_mode=${product_mode}\`. ${describeAntiLeak(product_mode)}`,
  );
  lines.push('8. Giữ nguyên block_id, window_start_s, window_end_s, intent, số lượng block.');
  lines.push(
    `9. **Aim conservative**: nhắm vào ${conservative_target} từ. NẾU không đạt min_words mà mọi candidate đã hết headroom: DỪNG ở tổng nhỏ hơn, KHÔNG vượt block cap. Quality guard sẽ tự quyết near_pass/fail.`,
  );
  lines.push(
    `10. Đếm lại từ trong full_script. Lý tưởng trong [${min_words}, ${max_words}]. NHƯNG: per-block cap luôn ưu tiên hơn tổng word count. Vượt block cap (đặc biệt CTA) là HARD FAIL.`,
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
