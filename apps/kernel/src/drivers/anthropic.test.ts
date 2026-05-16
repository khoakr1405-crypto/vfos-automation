import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist the mock function so vi.mock factory can reference it.
const mockCreate = vi.hoisted(() => vi.fn());

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
    constructor(_opts: unknown) {}
  },
}));

// Import AFTER mock is declared.
const { AnthropicDriver } = await import('./anthropic.js');

function makeResponse(
  text: string,
  usage: { input_tokens: number; cache_read_input_tokens?: number; output_tokens: number },
) {
  return {
    content: [{ type: 'text', text }],
    usage: { cache_read_input_tokens: 0, ...usage },
  };
}

describe('AnthropicDriver', () => {
  let driver: InstanceType<typeof AnthropicDriver>;

  beforeEach(() => {
    mockCreate.mockReset();
    driver = new AnthropicDriver('sk-ant-test-key');
  });

  it('returns text and token usage from API response', async () => {
    mockCreate.mockResolvedValue(
      makeResponse('hello world', { input_tokens: 10, output_tokens: 5 }),
    );

    const res = await driver.complete({
      model: 'claude-haiku-4-5-20251001',
      system: 'You are helpful.',
      user: 'Say hello',
      max_tokens: 100,
    });

    expect(res.text).toBe('hello world');
    expect(res.usage.input_tokens).toBe(10);
    expect(res.usage.output_tokens).toBe(5);
    expect(res.model).toBe('claude-haiku-4-5-20251001');
  });

  it('computes cost_cents correctly', async () => {
    // claude-haiku-4-5-20251001: in=$1/M, out=$5/M, cached=$0.1/M
    mockCreate.mockResolvedValue(
      makeResponse('ok', { input_tokens: 1_000_000, output_tokens: 1_000_000 }),
    );

    const res = await driver.complete({
      model: 'claude-haiku-4-5-20251001',
      system: 's',
      user: 'u',
      max_tokens: 100,
    });

    // $1 input + $5 output = $6 → 600 cents (ceil)
    expect(res.cost_cents).toBe(600);
  });

  it('tracks cached_input_tokens and reduces effective cost', async () => {
    // claude-sonnet-4-6: in=$3/M, out=$15/M, cached=$0.3/M
    mockCreate.mockResolvedValue(
      makeResponse('cached', {
        input_tokens: 0,
        cache_read_input_tokens: 1_000_000,
        output_tokens: 0,
      }),
    );

    const res = await driver.complete({
      model: 'claude-sonnet-4-6',
      system: 's',
      user: 'u',
      max_tokens: 100,
      cache_system: true,
    });

    expect(res.usage.cached_input_tokens).toBe(1_000_000);
    // $0.3/M cached = 30 cents
    expect(res.cost_cents).toBe(30);
  });

  it('passes cache_control block when cache_system is true', async () => {
    mockCreate.mockResolvedValue(
      makeResponse('ok', { input_tokens: 1, output_tokens: 1 }),
    );

    await driver.complete({
      model: 'claude-haiku-4-5-20251001',
      system: 'system text',
      user: 'user text',
      max_tokens: 50,
      cache_system: true,
    });

    const call = mockCreate.mock.calls[0]?.[0];
    expect(call.system[0]).toMatchObject({
      type: 'text',
      text: 'system text',
      cache_control: { type: 'ephemeral' },
    });
  });

  it('parses JSON from response when json_schema is provided', async () => {
    mockCreate.mockResolvedValue(
      makeResponse('{"niche":"skincare","confidence":0.9}', {
        input_tokens: 5,
        output_tokens: 10,
      }),
    );

    const res = await driver.complete({
      model: 'claude-haiku-4-5-20251001',
      system: 'classify',
      user: 'face serum',
      max_tokens: 100,
      json_schema: { type: 'object' },
    });

    expect(res.json).toEqual({ niche: 'skincare', confidence: 0.9 });
  });

  it('strips markdown fences before JSON parsing', async () => {
    mockCreate.mockResolvedValue(
      makeResponse('```json\n{"verdict":"PROCEED"}\n```', {
        input_tokens: 5,
        output_tokens: 10,
      }),
    );

    const res = await driver.complete({
      model: 'claude-haiku-4-5-20251001',
      system: 'evaluate',
      user: 'cool gadget',
      max_tokens: 100,
      json_schema: { type: 'object' },
    });

    expect(res.json).toEqual({ verdict: 'PROCEED' });
  });

  it('returns null json when response is unparseable', async () => {
    mockCreate.mockResolvedValue(
      makeResponse('sorry, I cannot JSON right now', {
        input_tokens: 5,
        output_tokens: 5,
      }),
    );

    const res = await driver.complete({
      model: 'claude-haiku-4-5-20251001',
      system: 's',
      user: 'u',
      max_tokens: 50,
      json_schema: { type: 'object' },
    });

    expect(res.json).toBeNull();
  });

  it('throws on unknown model', async () => {
    await expect(
      driver.complete({
        model: 'gpt-9000',
        system: 's',
        user: 'u',
        max_tokens: 100,
      }),
    ).rejects.toThrow('anthropic driver: unknown model gpt-9000');
  });
});
