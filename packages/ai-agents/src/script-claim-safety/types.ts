// Kiểu dữ liệu dùng chung cho đặc vụ Script Claim & Safety (RFC §1.3 + §2).
// Types-only module — không runtime.

// ---------- Product facts (Phase 1) ----------
export interface ScriptFacts {
  productName: string;
  shortProductName?: string;
  /** Nhãn giá đã format ("199K" | "45000") hoặc null khi card không có giá. KHÔNG bịa. */
  priceLabel: string | null;
}

// ---------- Vision context (Phase 1, cho prompt-builder) ----------
export interface VisionAnalysis {
  mainProductVisible?: boolean;
  productConfidence?: number;
  visibleScenes?: string[];
  keyVisualFeatures?: string[];
  demonstratedFeatures?: string[];
  scriptHints?: string[];
  mismatchWarnings?: string[];
  unsafeOrLowQualitySignals?: string[];
}

export interface VisionArtifact {
  analysis?: VisionAnalysis;
}

export interface PromptInput {
  productName: string;
  sourceVideoDurationSec: number;
  targetVoiceDurationSec: number;
  targetWordCount: number;
  /** Từ/giây của TTS provider (pace-aware). Mặc định 2.5 (edge) nếu không truyền. */
  wordsPerSec?: number;
  visionArtifact?: VisionArtifact | null;
}

// ---------- OpenAI caller (Phase 1) ----------
export interface OpenAiChatOptions {
  apiKey: string;
  model?: string;
  temperature?: number;
}

export interface OpenAiErrorBody {
  error?: { message?: string; type?: string; code?: string };
}

export interface OpenAiChatChoice {
  message?: { content?: string };
}

export interface OpenAiChatResponse {
  error?: { message?: string; type?: string; code?: string };
  choices?: OpenAiChatChoice[];
}

// ---------- Claim blocklist + validation (Phase 2 — skeleton nay) ----------
export type ClaimCategory =
  | 'superlative'
  | 'absolute'
  | 'false-equiv'
  | 'exaggeration'
  | 'health-claim'
  | 'guarantee';

export interface PhraseRule {
  id: string;
  phrase: string;
  severity: 'hard' | 'soft';
  category: ClaimCategory;
  note: string;
}

export interface PatternRule {
  id: string;
  pattern: RegExp;
  severity: 'hard' | 'soft';
  category: ClaimCategory;
  note: string;
}

export interface ClaimViolation {
  ruleId: string;
  matched: string;
  severity: 'hard' | 'soft';
  category: ClaimCategory;
  /** Vị trí trên chuỗi GỐC (không phải bản normalized). */
  index: number;
}

export type SafetyVerdict = 'safe' | 'safe_with_warnings' | 'blocked';

export interface ClaimScanResult {
  verdict: SafetyVerdict;
  violations: ClaimViolation[];
}

export interface WordBudgetResult {
  unit: string;
  count: number;
  max: number;
  withinLimit: boolean;
}

// ---------- Structural validate (DI callback từ scripts/core/validation.ts) ----------
export interface StructuralValidationInput {
  voiceoverText: string;
  hook: string;
  productName: string;
  targetDurationSec: number;
  estimatedSpeechDurationSec: number;
  visionAnalysis?: unknown;
}

export interface StructuralValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  metrics: {
    duplicateHookDetected: boolean;
    repeatedProductNameCount: number;
    tooLongForVideo: boolean;
    ngramRepetitionDetected: boolean;
    visionGrounded: boolean;
  };
}

// ---------- Agent I/O (Phase 2/3 — skeleton nay) ----------
export interface ScriptDraft {
  shortProductName: string;
  hook: string;
  voiceoverText: string;
  captionDraft: string;
  hashtags: string[];
  estimatedSpeechDurationSec: number;
  notes?: string[];
}

export interface SafetyReport {
  verdict: SafetyVerdict;
  violations: ClaimViolation[];
  wordBudget: WordBudgetResult[];
  checkedAt: string;
  source: 'ai' | 'template_fallback';
}

export interface RejectedVariant {
  attempt: number;
  reason: 'CLAIM_BLOCKED' | 'STRUCTURAL_FAIL' | 'WORD_BUDGET' | 'API_ERROR';
  violations: ClaimViolation[];
  errorDetail?: string;
}

export interface AgentInput {
  facts: ScriptFacts;
  sourceVideoDurationSec: number;
  targetVoiceDurationSec: number;
  targetWordCount: number;
  /** Từ/giây của TTS provider (pace-aware). Mặc định 2.5 (edge) nếu không truyền. */
  wordsPerSec?: number;
  visionArtifact?: VisionArtifact | null;
  /** Gate No-Go #2 — false ⇒ đi thẳng safe-fallback (không gọi API). */
  confirmAi: boolean;
  maxRetries?: number;
  /** DI: agent KHÔNG import validateScript của scripts/core → nhận qua callback. */
  structuralValidate: (input: StructuralValidationInput) => StructuralValidationResult;
  openAiApiKey?: string;
}

export interface AgentResult {
  status: 'ok' | 'fallback' | 'blocked';
  draft: ScriptDraft | null;
  safetyReport: SafetyReport;
  /** TRUNG THỰC — log đủ mọi biến thể bị loại. Cấm ghi "0 rejected" khi có reject. */
  rejectedVariants: RejectedVariant[];
}
