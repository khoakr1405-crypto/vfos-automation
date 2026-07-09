// @vfos/ai-agents — public surface.
// Đặc vụ đầu tiên: Script Claim & Safety (RFC docs/RFC_SCRIPT_SAFETY_AGENT.md).

export type {
  AgentInput,
  AgentResult,
  ClaimCategory,
  ClaimScanResult,
  ClaimViolation,
  OpenAiChatChoice,
  OpenAiChatOptions,
  OpenAiChatResponse,
  OpenAiErrorBody,
  PatternRule,
  PhraseRule,
  PromptInput,
  RejectedVariant,
  SafetyReport,
  SafetyVerdict,
  ScriptDraft,
  ScriptFacts,
  StructuralValidationInput,
  StructuralValidationResult,
  VisionAnalysis,
  VisionArtifact,
  WordBudgetResult,
} from './script-claim-safety/types.js';

// Phase 1 — migrated logic (zero behavior change)
export { extractProductName, readScriptFacts } from './script-claim-safety/product-card-facts.js';
export { buildScriptPrompt } from './script-claim-safety/prompt-builder.js';
export {
  buildChatRequest,
  callChatCompletion,
  escalatingFloorMs,
  extractContent,
  MAX_PER_WAIT_MS,
  MAX_RATE_LIMIT_WAITS,
  MAX_TOTAL_RATE_LIMIT_WAIT_MS,
  parseResetDuration,
  parseTryAgainMessage,
  rateLimitWaitMs,
  serverBackoffMs,
  serverSuggestedMs,
  sleep,
} from './script-claim-safety/openai-caller.js';

// Phase 2 — Validation Engine + blocklist data
export { PATTERN_RULES, PHRASE_RULES } from './script-claim-safety/claim-blocklist.js';
export {
  enforceWordBudget,
  normalizeVi,
  scanClaims,
  splitSentences,
} from './script-claim-safety/validation-engine.js';
export {
  chunkForSubtitles,
  MAX_SUBTITLE_WORDS,
} from './script-claim-safety/subtitle-chunker.js';

// Render-prep — pure logic (no fs/API): subtitle timing + render plan builder
export type {
  EdgeWord,
  RenderAudio,
  RenderCanvas,
  RenderOutput,
  RenderOverlay,
  RenderPlan,
  RenderVideoSource,
  SubtitleCue,
  SubtitleStyle,
  SubtitleTiming,
} from './render-prep/types.js';
export type { ResilientAlignment } from './render-prep/align-subtitles.js';
export {
  alignSubtitles,
  alignSubtitlesResilient,
  ttsWordCount,
} from './render-prep/align-subtitles.js';
export { buildRenderPlan } from './render-prep/build-render-plan.js';
// Phase 2/3 — skeleton (implement sau)
export { generateSafeScript } from './script-claim-safety/agent.js';
