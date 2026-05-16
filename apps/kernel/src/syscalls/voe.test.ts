import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AIRouter } from '../ai/router.js';
import { makeVoeSyscalls } from './voe.js';

function makeCtx(tenant_id = 'tenant-1') {
  return { tenant_id, caller: 'test', trace_id: null };
}

function makeRouterMock(json: unknown, model = 'claude-sonnet-4-6', cost_cents = 10) {
  return {
    run: vi.fn().mockResolvedValue({
      text: JSON.stringify(json),
      json,
      model,
      cost_cents,
      usage: { input_tokens: 100, cached_input_tokens: 0, output_tokens: 50 },
    }),
  } as unknown as AIRouter;
}

const VALID_INPUT = {
  source_url: 'https://www.tiktok.com/@user/video/123',
  platform: 'tiktok',
  niche: 'skincare',
  metadata: {
    title: 'Best face serum 2024',
    description: 'Amazing results',
    transcript: 'This serum changed my life',
    tags: ['skincare', 'serum'],
  },
  engagement: { views: 500000, likes: 20000, shares: 5000 },
};

const PROCEED_JSON = {
  vi_evaluation: {
    score: 82,
    confidence: 90,
    verdict: 'PROCEED',
    rationale: 'High engagement, product clearly visible, strong affiliate potential.',
    risks: ['Minor copyright risk on background music'],
    target_audience: 'Women 18-35 interested in skincare',
    affiliate_category: 'Mỹ phẩm / Skincare',
  },
  content_factory_handoff: {
    suggested_localization_angle: 'Review chân thực kiểu "tôi đã thử và đây là kết quả"',
    suggested_edit_direction: 'Cắt bỏ 5 giây đầu intro, zoom vào kết quả trước/sau',
    suggested_voice_style: 'AI giọng nữ nhẹ nhàng, năng lượng vừa phải',
    suggested_hook_angle: '"Loại serum này đang viral khắp TikTok vì lý do này..."',
  },
};

describe('agents.voe.evaluate', () => {
  let syscall: ReturnType<typeof makeVoeSyscalls>[number];

  beforeEach(() => {
    const router = makeRouterMock(PROCEED_JSON);
    [syscall] = makeVoeSyscalls(router);
  });

  it('returns PROCEED output with correct fields', async () => {
    const router = makeRouterMock(PROCEED_JSON);
    const [sc] = makeVoeSyscalls(router);

    const res = (await sc.handler(makeCtx(), VALID_INPUT)) as typeof PROCEED_JSON & {
      model: string;
      cost_cents: number;
    };

    expect(res.vi_evaluation.verdict).toBe('PROCEED');
    expect(res.vi_evaluation.score).toBe(82);
    expect(res.vi_evaluation.confidence).toBe(90);
    expect(res.vi_evaluation.risks).toHaveLength(1);
    expect(res.vi_evaluation.affiliate_category).toBe('Mỹ phẩm / Skincare');
    expect(res.content_factory_handoff.suggested_hook_angle).toContain('viral');
    expect(res.model).toBe('claude-sonnet-4-6');
    expect(res.cost_cents).toBe(10);
  });

  it('passes voe_evaluate intent to router', async () => {
    const router = makeRouterMock(PROCEED_JSON);
    const [sc] = makeVoeSyscalls(router);

    await sc.handler(makeCtx(), VALID_INPUT);

    expect(router.run).toHaveBeenCalledOnce();
    const call = (router.run as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(call.intent).toBe('voe_evaluate');
    expect(call.tenant_id).toBe('tenant-1');
    expect(call.json_schema).toBeDefined();
  });

  it('user payload includes all metadata fields', async () => {
    const router = makeRouterMock(PROCEED_JSON);
    const [sc] = makeVoeSyscalls(router);

    await sc.handler(makeCtx(), VALID_INPUT);

    const call = (router.run as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    const payload = JSON.parse(call.user);
    expect(payload.platform).toBe('tiktok');
    expect(payload.niche).toBe('skincare');
    expect(payload.views).toBe(500000);
    expect(payload.shares).toBe(5000);
  });

  it('defaults to SKIP when verdict is missing', async () => {
    const badJson = {
      vi_evaluation: { score: 40, confidence: 50 },
      content_factory_handoff: {},
    };
    const router = makeRouterMock(badJson);
    const [sc] = makeVoeSyscalls(router);

    const res = (await sc.handler(makeCtx(), VALID_INPUT)) as { vi_evaluation: { verdict: string } };

    expect(res.vi_evaluation.verdict).toBe('SKIP');
  });

  it('returns safe defaults when model returns null json', async () => {
    const router = {
      run: vi.fn().mockResolvedValue({
        text: 'sorry cannot JSON',
        json: null,
        model: 'claude-sonnet-4-6',
        cost_cents: 5,
        usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5 },
      }),
    } as unknown as AIRouter;
    const [sc] = makeVoeSyscalls(router);

    const res = (await sc.handler(makeCtx(), VALID_INPUT)) as {
      vi_evaluation: { score: number; verdict: string; risks: unknown[] };
      content_factory_handoff: { suggested_hook_angle: string };
    };

    expect(res.vi_evaluation.score).toBe(0);
    expect(res.vi_evaluation.verdict).toBe('SKIP');
    expect(res.vi_evaluation.risks).toEqual([]);
    expect(res.content_factory_handoff.suggested_hook_angle).toBe('');
  });

  it('throws ZodError on invalid input (missing required fields)', async () => {
    const router = makeRouterMock(PROCEED_JSON);
    const [sc] = makeVoeSyscalls(router);

    await expect(
      sc.handler(makeCtx(), { platform: 'tiktok' }),
    ).rejects.toThrow();
  });

  it('throws ZodError on invalid platform value', async () => {
    const router = makeRouterMock(PROCEED_JSON);
    const [sc] = makeVoeSyscalls(router);

    await expect(
      sc.handler(makeCtx(), { ...VALID_INPUT, platform: 'instagram' }),
    ).rejects.toThrow();
  });

  it('syscall is marked auditable with correct scope', () => {
    const router = makeRouterMock(PROCEED_JSON);
    const [sc] = makeVoeSyscalls(router);

    expect(sc.name).toBe('agents.voe.evaluate');
    expect(sc.auditable).toBe(true);
    expect(sc.requiredScope).toBe('agents.voe');
  });

  it('works without optional shares field', async () => {
    const router = makeRouterMock(PROCEED_JSON);
    const [sc] = makeVoeSyscalls(router);

    const inputNoShares = {
      ...VALID_INPUT,
      engagement: { views: 100000, likes: 5000 },
    };

    const res = await sc.handler(makeCtx(), inputNoShares);
    expect(res).toBeDefined();

    const call = (router.run as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    const payload = JSON.parse(call.user);
    expect(payload.shares).toBeNull();
  });
});
