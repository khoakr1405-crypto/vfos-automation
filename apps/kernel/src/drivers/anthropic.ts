import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMCapability,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMDriver,
} from '@vfos/sdk';
import { ANTHROPIC_PRICING, computeCostCents } from './pricing.js';

export class AnthropicDriver implements LLMDriver {
  readonly name = 'anthropic';
  readonly capabilities: readonly LLMCapability[] = [
    'reasoning',
    'tool_use',
    'vision',
    'long_context',
    'json_mode',
  ];
  readonly pricing = ANTHROPIC_PRICING;

  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const pricing = this.pricing[req.model];
    if (!pricing) {
      throw new Error(`anthropic driver: unknown model ${req.model}`);
    }

    const systemBlocks = req.cache_system
      ? [{ type: 'text' as const, text: req.system, cache_control: { type: 'ephemeral' as const } }]
      : [{ type: 'text' as const, text: req.system }];

    const userText = req.json_schema
      ? `${req.user}\n\nReturn ONLY valid JSON matching this schema:\n${JSON.stringify(req.json_schema)}`
      : req.user;

    const res = await this.client.messages.create({
      model: req.model,
      max_tokens: req.max_tokens,
      system: systemBlocks,
      messages: [{ role: 'user', content: userText }],
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const usage = {
      input_tokens: res.usage.input_tokens ?? 0,
      cached_input_tokens: res.usage.cache_read_input_tokens ?? 0,
      output_tokens: res.usage.output_tokens ?? 0,
    };

    const response: LLMCompletionResponse = {
      text,
      usage,
      model: req.model,
      cost_cents: computeCostCents(pricing, usage),
    };

    if (req.json_schema) {
      response.json = safeJsonParse(text);
    }

    return response;
  }
}

function safeJsonParse(text: string): unknown {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
