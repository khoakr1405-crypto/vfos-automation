import type { LLMPricing } from '@vfos/sdk';

export const ANTHROPIC_PRICING: Readonly<Record<string, LLMPricing>> = {
  'claude-opus-4-7': { in: 15.0, out: 75.0, cached_in: 1.5 },
  'claude-sonnet-4-6': { in: 3.0, out: 15.0, cached_in: 0.3 },
  'claude-haiku-4-5-20251001': { in: 1.0, out: 5.0, cached_in: 0.1 },
};

export const MOCK_PRICING: Readonly<Record<string, LLMPricing>> = {
  'mock-default': { in: 0, out: 0, cached_in: 0 },
};

export function computeCostCents(
  pricing: LLMPricing,
  usage: { input_tokens: number; cached_input_tokens: number; output_tokens: number },
): number {
  const usd =
    (usage.input_tokens * pricing.in) / 1_000_000 +
    (usage.cached_input_tokens * pricing.cached_in) / 1_000_000 +
    (usage.output_tokens * pricing.out) / 1_000_000;
  return Math.ceil(usd * 100);
}
