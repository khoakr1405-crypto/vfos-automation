/**
 * Status API — HTTP routes for pipeline run monitoring.
 *
 * Registers on the existing Fastify instance via `registerStatusRoutes()`.
 * Routes are public (no auth) by design so the CLI can query without tokens.
 * In production, these should be locked behind auth — deferred to P1.
 *
 * Endpoints:
 *   GET /api/runs          — list all runs (filterable by ?status, ?lane, ?limit)
 *   GET /api/runs/summary  — aggregate counts by status
 *   GET /api/runs/:id      — single run detail
 *   POST /api/runs/demo    — seed demo runs for testing (dev only)
 */

import type { FastifyInstance } from 'fastify';
import type { RunLane, RunStatus, RunStore } from './run-store.js';

export function registerStatusRoutes(
  app: FastifyInstance,
  runStore: RunStore,
  opts: { isDev: boolean },
): void {
  // List runs — optional query filters
  app.get('/api/runs', async (req) => {
    const q = req.query as { status?: string; lane?: string; limit?: string };
    const limit = q.limit ? Math.min(Number(q.limit), 200) : 50;
    const filter: { status?: RunStatus; lane?: RunLane; limit?: number } = { limit };
    if (q.status) filter.status = q.status as RunStatus;
    if (q.lane) filter.lane = q.lane as RunLane;
    const runs = runStore.list(filter);
    return { ok: true, count: runs.length, runs };
  });

  // Summary — aggregate counts
  app.get('/api/runs/summary', async () => {
    return { ok: true, summary: runStore.summary() };
  });

  // Single run detail
  app.get('/api/runs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const run = runStore.get(id);
    if (!run) {
      reply.code(404);
      return { ok: false, error: `run not found: ${id}` };
    }
    return { ok: true, run };
  });

  // Seed demo runs — dev only, for testing the CLI
  if (opts.isDev) {
    app.post('/api/runs/demo', async () => {
      const r1 = runStore.createRun({ lane: 'review_product', video_id: 'yt_016' });
      runStore.startRun(r1.run_id);
      runStore.startStep(r1.run_id, 'shopee:resolve');
      runStore.completeStep(r1.run_id, 'shopee:resolve', {
        key: 'shopee_product_card',
        path: 'production/_runs/yt_016/shopee/shopee_product_card.json',
      });
      runStore.startStep(r1.run_id, 'demo:match');
      runStore.completeStep(r1.run_id, 'demo:match');
      runStore.startStep(r1.run_id, 'script:generate');
      runStore.completeStep(r1.run_id, 'script:generate', {
        key: 'script_output',
        path: 'production/_runs/yt_016/script/script_ai_v1_extended.json',
      });
      runStore.startStep(r1.run_id, 'voice:generate');
      // Leave r1 running at voice:generate

      const r2 = runStore.createRun({ lane: 'review_product', video_id: 'yt_015' });
      runStore.startRun(r2.run_id);
      for (const step of [
        'shopee:resolve', 'demo:match', 'script:generate', 'script:guard',
        'voice:generate', 'voice:sync', 'bgm:mix', 'final:render', 'publish:plan',
      ]) {
        runStore.startStep(r2.run_id, step);
        runStore.completeStep(r2.run_id, step);
      }
      runStore.completeRun(r2.run_id);

      const r3 = runStore.createRun({ lane: 'review_product', video_id: 'yt_014' });
      runStore.startRun(r3.run_id);
      runStore.startStep(r3.run_id, 'shopee:resolve');
      runStore.completeStep(r3.run_id, 'shopee:resolve');
      runStore.startStep(r3.run_id, 'demo:match');
      runStore.completeStep(r3.run_id, 'demo:match');
      runStore.startStep(r3.run_id, 'script:generate');
      runStore.completeStep(r3.run_id, 'script:generate');
      runStore.startStep(r3.run_id, 'script:guard');
      runStore.completeStep(r3.run_id, 'script:guard');
      runStore.startStep(r3.run_id, 'voice:generate');
      runStore.completeStep(r3.run_id, 'voice:generate');
      runStore.startStep(r3.run_id, 'voice:sync');
      runStore.completeStep(r3.run_id, 'voice:sync');
      runStore.startStep(r3.run_id, 'bgm:mix');
      runStore.failRun(r3.run_id, 'FFmpeg OOM: insufficient memory for 4K source');

      const r4 = runStore.createRun({ lane: 'review_product', product_id: 'sp_8827' });
      // Leave r4 as pending

      return {
        ok: true,
        message: 'seeded 4 demo runs',
        runs: [r1.run_id, r2.run_id, r3.run_id, r4.run_id],
      };
    });
  }
}
