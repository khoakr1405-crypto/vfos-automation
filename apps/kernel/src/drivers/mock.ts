import { createHash } from 'node:crypto';
import type {
  LLMCapability,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMDriver,
} from '@vfos/sdk';
import { MOCK_PRICING, computeCostCents } from './pricing.js';

const NICHE_HEURISTIC: readonly { keywords: readonly string[]; niche: string }[] = [
  { keywords: ['earbud', 'headphone', 'wireless', 'bluetooth', 'audio'], niche: 'audio_gadgets' },
  { keywords: ['mask', 'skincare', 'serum', 'cosmetic', 'beauty', 'skin'], niche: 'skincare' },
  { keywords: ['kettle', 'kitchen', 'cookware', 'pan', 'pot', 'blender'], niche: 'home_kitchen' },
  { keywords: ['phone', 'case', 'charger', 'gadget'], niche: 'mobile_accessories' },
  { keywords: ['food', 'recipe', 'cooking', 'eat', 'meal'], niche: 'food_recipe' },
];

export class MockLLMDriver implements LLMDriver {
  readonly name = 'mock';
  readonly capabilities: readonly LLMCapability[] = ['reasoning', 'json_mode'];
  readonly pricing = MOCK_PRICING;

  async complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const hash = createHash('sha256')
      .update(`${req.system}|${req.user}|${req.model}`)
      .digest('hex')
      .slice(0, 8);

    let text: string;
    let json: unknown;

    if (req.json_schema) {
      json = this.fakeJson(req);
      text = JSON.stringify(json);
    } else {
      text = `[mock-${req.model}-${hash}] ${req.user.slice(0, 80)}`;
    }

    const usage = {
      input_tokens: Math.ceil((req.system.length + req.user.length) / 4),
      cached_input_tokens: req.cache_system ? Math.ceil(req.system.length / 4) : 0,
      output_tokens: Math.ceil(text.length / 4),
    };

    const pricing = this.pricing['mock-default'];
    const response: LLMCompletionResponse = {
      text,
      usage,
      model: req.model,
      cost_cents: pricing ? computeCostCents(pricing, usage) : 0,
    };
    if (json !== undefined) response.json = json;
    return response;
  }

  private fakeJson(req: LLMCompletionRequest): unknown {
    const schemaText = JSON.stringify(req.json_schema ?? {});
    const text = req.user.toLowerCase();

    if (schemaText.includes('"risk"') && schemaText.includes('"flags"')) {
      let risk = 0.05;
      const flags: string[] = [];
      const bump = (cat: string, delta: number): void => {
        flags.push(cat);
        risk += delta;
      };
      if (/(weapon|gun|knife|firearm)/.test(text)) bump('weapons', 0.55);
      if (/(alcohol|vape|tobacco|drug)/.test(text)) bump('regulated_substance', 0.45);
      if (/(weight loss|cure|miracle|detox|fat burner)/.test(text)) bump('medical_claim', 0.35);
      if (/(nude|sexual|nsfw)/.test(text)) bump('sexual_content', 0.6);
      if (/(hate|racist|slur)/.test(text)) bump('hate_speech', 0.7);
      if (/(stunt|dangerous|reckless)/.test(text)) bump('dangerous_act', 0.4);
      return {
        risk: Math.min(0.95, Number(risk.toFixed(3))),
        flags,
        reasoning:
          flags.length === 0
            ? 'no policy concerns detected by mock driver'
            : `mock flagged: ${flags.join(', ')}`,
        _driver: 'mock',
      };
    }

    if (schemaText.includes('"niche"')) {
      const match = NICHE_HEURISTIC.find((h) => h.keywords.some((kw) => text.includes(kw)));
      return {
        niche: match?.niche ?? 'general',
        confidence: match ? 0.82 : 0.35,
        _driver: 'mock',
      };
    }

    return { _driver: 'mock', echo: text.slice(0, 60) };
  }
}
