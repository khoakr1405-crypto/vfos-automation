import { ulid } from 'ulid';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { AIRouter } from './ai/router.js';
import { BudgetGuard } from './ai/budget.js';
import { DriverRegistry } from './drivers/registry.js';
import { AnthropicDriver } from './drivers/anthropic.js';
import { MockLLMDriver } from './drivers/mock.js';
import type { LLMIntent } from '@vfos/sdk';
import { setupTelemetry, shutdownTelemetry } from './telemetry/setup.js';

const PROMPTS: Record<LLMIntent, { system: string; user: string; schema?: Record<string, unknown> }> = {
  caption_hook: {
    system: 'Write a punchy TikTok caption under 100 chars. Include one emoji.',
    user: 'review of wireless earbuds that block highway noise',
  },
  classify_niche: {
    system:
      'Classify a TikTok video into one of: audio_gadgets, skincare, home_kitchen, mobile_accessories, food_recipe, general.',
    user: 'making a creamy mushroom risotto in 20 minutes',
    schema: {
      type: 'object',
      required: ['niche', 'confidence'],
      properties: { niche: { type: 'string' }, confidence: { type: 'number' } },
    },
  },
  policy_check: {
    system:
      'You are a TikTok content policy reviewer. Score risk 0-1 and list any flags.',
    user: 'a serum that cures all acne overnight, results guaranteed',
    schema: {
      type: 'object',
      required: ['risk', 'flags', 'reasoning'],
      properties: {
        risk: { type: 'number' },
        flags: { type: 'array', items: { type: 'string' } },
        reasoning: { type: 'string' },
      },
    },
  },
  editorial_rewrite: {
    system: 'Rewrite punchier, keep meaning, under 280 chars.',
    user: 'these earbuds are pretty good, the audio is decent and battery is okay',
  },
  tool_loop: {
    system: 'Decompose the user task into ordered tool-call steps.',
    user: 'find a trending audio, write a caption, schedule for 9pm',
  },
  voe_evaluate: {
    system:
      'You are a Vietnam affiliate content strategist. Evaluate the video metadata provided as JSON. ' +
      'Assess viral potential and affiliate conversion likelihood for Facebook Reels and TikTok Vietnam. ' +
      'Return STRICT JSON with vi_evaluation (score, confidence, verdict, rationale, risks, ' +
      'target_audience, affiliate_category) and content_factory_handoff fields.',
    user: JSON.stringify({
      source_url: 'https://tiktok.com/@cleantok/video/sample',
      platform: 'tiktok',
      niche: 'vệ sinh nhà cửa',
      title: 'Magic Kitchen Cleaner Spray #cleantok',
      description: 'Xóa bay vết dầu mỡ 10 năm tuổi trên chảo chỉ với 1 lần xịt.',
      transcript: 'Cái chảo này tôi định vứt đi rồi. Xịt lên, đợi 30 giây, lau nhẹ. Tuyệt vời!',
      tags: ['cleantok', 'satisfying', 'kitchenhack'],
      views: 5000000,
      likes: 850000,
      shares: 60000,
    }),
    schema: { type: 'object', required: ['vi_evaluation', 'content_factory_handoff'] },
  },
};

async function main(): Promise<void> {
  const target = (process.argv[2] as LLMIntent | undefined) ?? 'classify_niche';
  if (!(target in PROMPTS)) {
    console.error(`unknown intent: ${target}`);
    console.error(`valid: ${Object.keys(PROMPTS).join(', ')}`);
    process.exit(2);
  }
  setupTelemetry();
  const cfg = loadConfig();
  const logger = createLogger(cfg);
  const drivers = new DriverRegistry(logger);
  if (cfg.ANTHROPIC_API_KEY) drivers.register(new AnthropicDriver(cfg.ANTHROPIC_API_KEY));
  drivers.register(new MockLLMDriver());
  const budget = new BudgetGuard(logger, { defaultDailyCeilingUsd: cfg.BUDGET_DAILY_USD });
  const router = new AIRouter(drivers, budget, logger, {
    fallbackDriver: cfg.ANTHROPIC_API_KEY ? 'anthropic' : 'mock',
  });
  const route = router.routeFor(target);
  console.log(
    JSON.stringify(
      {
        intent: target,
        route,
        anthropic_enabled: drivers.has('anthropic'),
        budget_ceiling_cents: cfg.BUDGET_DAILY_USD * 100,
      },
      null,
      2,
    ),
  );
  const prompt = PROMPTS[target];
  const start = performance.now();
  const reqOpts: Parameters<AIRouter['run']>[0] = {
    intent: target,
    system: prompt.system,
    user: prompt.user,
    tenant_id: cfg.TENANT_DEFAULT_ID,
  };
  if (prompt.schema) reqOpts.json_schema = prompt.schema;
  const res = await router.run(reqOpts);
  const ms = Math.round(performance.now() - start);
  console.log('---');
  console.log(
    JSON.stringify(
      {
        latency_ms: ms,
        model: res.model,
        usage: res.usage,
        cost_cents: res.cost_cents,
        json: res.json ?? null,
        text_preview: res.text.slice(0, 280),
        trace_id: ulid(),
      },
      null,
      2,
    ),
  );
  await shutdownTelemetry();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
