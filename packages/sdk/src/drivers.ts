export type LLMIntent =
  | 'editorial_rewrite'
  | 'caption_hook'
  | 'classify_niche'
  | 'policy_check'
  | 'tool_loop';

export type LLMCapability =
  | 'reasoning'
  | 'tool_use'
  | 'vision'
  | 'long_context'
  | 'json_mode';

export interface LLMUsage {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
}

export interface LLMCompletionRequest {
  model: string;
  system: string;
  user: string;
  cache_system: boolean;
  max_tokens: number;
  json_schema?: Record<string, unknown>;
}

export interface LLMCompletionResponse {
  text: string;
  json?: unknown;
  usage: LLMUsage;
  model: string;
  cost_cents: number;
}

export interface LLMPricing {
  in: number;
  out: number;
  cached_in: number;
}

export interface LLMDriver {
  readonly name: string;
  readonly capabilities: readonly LLMCapability[];
  readonly pricing: Readonly<Record<string, LLMPricing>>;
  complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse>;
}
