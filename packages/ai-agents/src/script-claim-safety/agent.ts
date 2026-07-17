// Script Claim & Safety Agent — orchestrator (RFC §1.3/§2.4, Phase 3).
// Vòng: build prompt → callChatCompletion → parse → scanClaims + enforceWordBudget
//   + structuralValidate (DI) → lỗi thì retry ≤ maxRetries kèm feedback cụm cấm
//   vào prompt → hết lượt (hoặc confirmAi=false / thiếu key) → safe-fallback template.
// KHÔNG chạm FS (command lo persist); KHÔNG import scripts/ (structuralValidate qua DI).
// rejectedVariants log TRUNG THỰC mọi biến thể bị loại + lý do.

import { callChatCompletion, extractContent, serverBackoffMs, sleep } from './openai-caller.js';
import { buildScriptPrompt } from './prompt-builder.js';
import type {
  AgentInput,
  AgentResult,
  ClaimScanResult,
  OpenAiChatResponse,
  OpenAiErrorBody,
  RejectedVariant,
  SafetyReport,
  ScriptDraft,
  WordBudgetResult,
} from './types.js';
import { enforceWordBudget, scanClaims } from './validation-engine.js';

const DEFAULT_MAX_RETRIES = 3;
const MODEL = 'gpt-4o-mini';

// Parse chuỗi JSON do model trả về thành ScriptDraft (khớp field cũ script.ts:
// voiceoverText/hook default '', estimatedSpeechDurationSec parse số/'26.5').
function parseDraft(content: string): ScriptDraft {
  const raw = JSON.parse(content) as Record<string, unknown>;
  const estRaw = raw.estimatedSpeechDurationSec;
  const estimated =
    typeof estRaw === 'number' ? estRaw : Number.parseFloat(String(estRaw ?? '26.5'));
  return {
    shortProductName: typeof raw.shortProductName === 'string' ? raw.shortProductName : '',
    hook: typeof raw.hook === 'string' ? raw.hook : '',
    voiceoverText: typeof raw.voiceoverText === 'string' ? raw.voiceoverText : '',
    captionDraft: typeof raw.captionDraft === 'string' ? raw.captionDraft : '',
    hashtags: Array.isArray(raw.hashtags) ? raw.hashtags.map((h) => String(h)) : [],
    estimatedSpeechDurationSec: Number.isFinite(estimated) ? estimated : 26.5,
    ...(Array.isArray(raw.notes) ? { notes: raw.notes.map((n) => String(n)) } : {}),
  };
}

function buildSafetyReport(
  scan: ClaimScanResult,
  wordBudget: WordBudgetResult[],
  source: SafetyReport['source'],
): SafetyReport {
  return {
    verdict: scan.verdict,
    violations: scan.violations,
    wordBudget,
    checkedAt: new Date().toISOString(),
    source,
  };
}

// Feedback ép model sửa đúng lỗi ở attempt trước (Phase 3 — cải tiến có chủ đích:
// bản cũ dùng lại prompt y nguyên mỗi lần, không dạy model tránh lỗi).
function buildRetryFeedback(rejected: RejectedVariant): string {
  if (rejected.reason === 'CLAIM_BLOCKED') {
    const phrases = rejected.violations.map((v) => `"${v.matched}"`).join(', ');
    return `\n--- PHẢN HỒI SỬA LỖI (attempt ${rejected.attempt}) ---\nBản trước VI PHẠM claim cấm — TUYỆT ĐỐI KHÔNG dùng các cụm sau: ${phrases}.\nHãy viết lại, loại bỏ hoàn toàn mọi cụm nói quá/cam kết tuyệt đối/claim sức khỏe.\n`;
  }
  if (rejected.reason === 'STRUCTURAL_FAIL') {
    return `\n--- PHẢN HỒI SỬA LỖI (attempt ${rejected.attempt}) ---\nBản trước LỖI CẤU TRÚC: ${rejected.errorDetail ?? '(không rõ)'}\nHãy viết lại khắc phục đúng các lỗi trên (không lặp hook, không lặp tên SP, đủ độ dài, không vượt thời lượng).\n`;
  }
  return '';
}

async function readHttpErrorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as OpenAiErrorBody;
    return body?.error?.message ?? JSON.stringify(body);
  } catch {
    const text = await response.text().catch(() => '');
    return text || '(no body)';
  }
}

// Safe-fallback template — bản viết tay LUÔN claim-safe. Phase 3 SAFETY-FIX:
// đã bỏ superlative "lựa chọn đỉnh nhất" của bản cũ (script.ts:641).
function buildFallback(input: AgentInput, rejectedVariants: RejectedVariant[]): AgentResult {
  const { productName, priceLabel } = input.facts;
  const hook = `Ê khoan lướt qua nha, cái ${productName.slice(0, 50)} này siêu hot luôn!`;
  const priceLine = priceLabel ? `Giá chỉ ${priceLabel} thôi, quá hời luôn.` : '';
  const voiceoverText = [
    hook,
    `Đây là sản phẩm ${productName} mà mình muốn review cho mọi người.`,
    'Chất lượng thì xịn lắm, mình đã test thử rồi nè.',
    priceLine,
    'Thiết kế nhỏ gọn, tiện lợi, dùng được ở mọi nơi.',
    'Nếu bạn đang tìm một sản phẩm giá hợp lý thì đây là gợi ý đáng để tham khảo.',
    'Bấm link bên dưới để mua ngay nha, số lượng có hạn!',
  ]
    .filter(Boolean)
    .join(' ');
  const captionDraft = `${productName} — Review nhanh! ${priceLabel ? `Giá ${priceLabel}` : ''} #vfos #review #dealhot`;

  const draft: ScriptDraft = {
    shortProductName: productName.slice(0, 30),
    hook,
    voiceoverText,
    captionDraft,
    hashtags: ['#vfos', '#review', '#dealhot'],
    estimatedSpeechDurationSec: 26.5,
    notes: ['template_fallback'],
  };

  const scan = scanClaims(`${hook} ${voiceoverText}`);
  const wordBudget = enforceWordBudget(voiceoverText);
  const safetyReport = buildSafetyReport(scan, wordBudget, 'template_fallback');

  // Backstop: nếu ngay cả template an toàn vẫn dính hard-claim (vd ai đó sửa
  // template thêm cụm cấm) → KHÔNG ship, báo blocked để command trả exit 8.
  if (scan.verdict === 'blocked') {
    return { status: 'blocked', draft: null, safetyReport, rejectedVariants };
  }
  return { status: 'fallback', draft, safetyReport, rejectedVariants };
}

export async function generateSafeScript(input: AgentInput): Promise<AgentResult> {
  const maxRetries = input.maxRetries ?? DEFAULT_MAX_RETRIES;
  const rejectedVariants: RejectedVariant[] = [];

  if (input.confirmAi && input.openAiApiKey) {
    const basePrompt = buildScriptPrompt({
      productName: input.facts.productName,
      sourceVideoDurationSec: input.sourceVideoDurationSec,
      targetVoiceDurationSec: input.targetVoiceDurationSec,
      targetWordCount: input.targetWordCount,
      // exactOptionalPropertyTypes: chỉ set khi có giá trị (else prompt-builder ?? 2.5).
      ...(input.wordsPerSec !== undefined ? { wordsPerSec: input.wordsPerSec } : {}),
      visionArtifact: input.visionArtifact ?? null,
    });

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const last = rejectedVariants.at(-1);
      const feedback = attempt > 1 && last ? buildRetryFeedback(last) : '';
      const prompt = feedback ? `${basePrompt}${feedback}` : basePrompt;

      console.log(
        `Calling OpenAI API (${MODEL}, in-process) — attempt ${attempt}/${maxRetries}...`,
      );

      let content: string;
      try {
        const response = await callChatCompletion(prompt, {
          apiKey: input.openAiApiKey,
          model: MODEL,
          temperature: 0.7,
        });

        if (!response.ok) {
          const detail = await readHttpErrorDetail(response);
          rejectedVariants.push({
            attempt,
            reason: 'API_ERROR',
            violations: [],
            errorDetail: `HTTP ${response.status}: ${detail}`,
          });
          // 429 còn sau vòng chờ nội bộ của caller → fail nhanh (không đốt attempt).
          if (response.status === 429) break;
          // 5xx transient → backoff ngắn theo attempt rồi thử lại.
          if (response.status >= 500 && attempt < maxRetries) await sleep(serverBackoffMs(attempt));
          continue;
        }

        const resObj = (await response.json()) as OpenAiChatResponse;
        if (resObj.error) {
          rejectedVariants.push({
            attempt,
            reason: 'API_ERROR',
            violations: [],
            errorDetail: resObj.error.message ?? 'response body error',
          });
          continue;
        }
        content = extractContent(resObj);
      } catch (e) {
        rejectedVariants.push({
          attempt,
          reason: 'API_ERROR',
          violations: [],
          errorDetail: (e as Error).message,
        });
        continue;
      }

      let draft: ScriptDraft;
      try {
        draft = parseDraft(content);
      } catch (e) {
        rejectedVariants.push({
          attempt,
          reason: 'API_ERROR',
          violations: [],
          errorDetail: `JSON parse: ${(e as Error).message}`,
        });
        continue;
      }

      // Cổng CLAIM (mới) + cổng CẤU TRÚC (DI validateScript của core, giữ layering).
      const scan = scanClaims(`${draft.hook} ${draft.voiceoverText}`);
      const wordBudget = enforceWordBudget(draft.voiceoverText);

      if (scan.verdict === 'blocked') {
        rejectedVariants.push({ attempt, reason: 'CLAIM_BLOCKED', violations: scan.violations });
        continue;
      }

      const structural = input.structuralValidate({
        voiceoverText: draft.voiceoverText,
        hook: draft.hook,
        productName: input.facts.productName,
        targetDurationSec: input.targetVoiceDurationSec,
        estimatedSpeechDurationSec: draft.estimatedSpeechDurationSec,
        visionAnalysis: input.visionArtifact ?? undefined,
      });
      if (!structural.passed) {
        rejectedVariants.push({
          attempt,
          reason: 'STRUCTURAL_FAIL',
          violations: [],
          errorDetail: structural.errors.join('; '),
        });
        continue;
      }

      return {
        status: 'ok',
        draft,
        safetyReport: buildSafetyReport(scan, wordBudget, 'ai'),
        rejectedVariants,
      };
    }
  }

  // confirmAi=false, thiếu key, hoặc AI hết lượt → safe-fallback template.
  return buildFallback(input, rejectedVariants);
}
