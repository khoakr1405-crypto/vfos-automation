import { z } from 'zod';
import type { LLMIntent } from '@vfos/sdk';
import type { AIRouter, RunRequest } from '../ai/router.js';
import type { SyscallSpec } from '../syscall-registry.js';

const INTENT = z.enum([
  'editorial_rewrite',
  'caption_hook',
  'classify_niche',
  'policy_check',
  'tool_loop',
]);

const CompleteInput = z.object({
  intent: INTENT,
  system: z.string().min(1),
  user: z.string().min(1),
});

const JsonInput = z.object({
  intent: INTENT,
  system: z.string().min(1),
  user: z.string().min(1),
  schema: z.record(z.unknown()),
});

const TestInput = z.object({
  intent: INTENT,
  system: z.string().min(1),
  user: z.string().min(1),
  schema: z.record(z.unknown()).optional(),
});

export function makeAiSyscalls(router: AIRouter): readonly SyscallSpec[] {
  const aiComplete: SyscallSpec = {
    name: 'ai.complete',
    description: 'Run an LLM completion via the AIRouter (intent-routed).',
    requiredScope: 'ai.complete',
    auditable: true,
    handler: async (ctx, raw) => {
      const args = CompleteInput.parse(raw);
      const res = await router.run({
        intent: args.intent as LLMIntent,
        system: args.system,
        user: args.user,
        tenant_id: ctx.tenant_id,
      });
      return {
        text: res.text,
        model: res.model,
        usage: res.usage,
        cost_cents: res.cost_cents,
      };
    },
  };

  const aiJson: SyscallSpec = {
    name: 'ai.json',
    description: 'Run an LLM completion that must return JSON matching a schema.',
    requiredScope: 'ai.complete',
    auditable: true,
    handler: async (ctx, raw) => {
      const args = JsonInput.parse(raw);
      const res = await router.run({
        intent: args.intent as LLMIntent,
        system: args.system,
        user: args.user,
        tenant_id: ctx.tenant_id,
        json_schema: args.schema,
      });
      return {
        json: res.json,
        model: res.model,
        usage: res.usage,
        cost_cents: res.cost_cents,
      };
    },
  };

  const aiTest: SyscallSpec = {
    name: 'ai.test',
    description:
      'Admin diagnostic: run an LLM call and return full response, driver, route, usage, cost, latency.',
    requiredScope: 'tenant.admin',
    handler: async (ctx, raw) => {
      const args = TestInput.parse(raw);
      const route = router.routeFor(args.intent as LLMIntent);
      const driverAvailable = router.hasDriver(route.driver);
      const start = performance.now();
      const runReq: RunRequest = {
        intent: args.intent as LLMIntent,
        system: args.system,
        user: args.user,
        tenant_id: ctx.tenant_id,
      };
      if (args.schema) runReq.json_schema = args.schema;
      const res = await router.run(runReq);
      const ms = Math.round(performance.now() - start);
      return {
        intent: args.intent,
        route: { ...route, driver_available: driverAvailable },
        model: res.model,
        text: res.text,
        json: res.json ?? null,
        usage: res.usage,
        cost_cents: res.cost_cents,
        latency_ms: ms,
        cache_enabled: route.cache_system,
      };
    },
  };

  return [aiComplete, aiJson, aiTest];
}
