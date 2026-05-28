/**
 * Run Store — Single source of truth for pipeline run state.
 *
 * Design decisions:
 * - In-memory Map for fast reads + JSON file persistence for crash recovery.
 * - No database dependency — keeps P0 lightweight and self-contained.
 * - JSON file is written on every state mutation (debounced by 500ms) so
 *   the CLI can read it even when the kernel is down.
 * - Thread-safe within a single Node process (no concurrent writes possible
 *   in single-threaded event loop). Multi-process safety deferred to P1.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ulid } from 'ulid';
import type { Logger } from 'pino';

// ── Types ────────────────────────────────────────────────────────────────

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'paused';

export type RunLane = 'review_product';

/** Steps for the review_product lane — ordered sequentially. */
export const REVIEW_PRODUCT_STEPS = [
  'shopee:resolve',
  'demo:match',
  'script:generate',
  'script:guard',
  'voice:generate',
  'voice:sync',
  'bgm:mix',
  'final:render',
  'publish:plan',
] as const;

export type ReviewProductStep = (typeof REVIEW_PRODUCT_STEPS)[number];

export interface RunArtifacts {
  shopee_product_card?: string;
  demo_match_result?: string;
  script_output?: string;
  voice_manifest?: string;
  bgm_manifest?: string;
  preview_video?: string;
  subtitle_plan?: string;
  publish_plan?: string;
  [key: string]: string | undefined;
}

export interface PipelineRun {
  run_id: string;
  lane: RunLane;
  video_id: string | null;
  product_id: string | null;
  status: RunStatus;
  current_step: string | null;
  steps_completed: number;
  steps_total: number;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  error: string | null;
  artifacts: RunArtifacts;
}

export interface CreateRunOpts {
  lane: RunLane;
  video_id?: string;
  product_id?: string;
}

// ── Run Store ────────────────────────────────────────────────────────────

export class RunStore {
  private readonly runs = new Map<string, PipelineRun>();
  private persistTimer: NodeJS.Timeout | null = null;
  private readonly persistPath: string;

  constructor(
    private readonly logger: Logger,
    opts: { dataDir: string },
  ) {
    this.persistPath = join(opts.dataDir, 'pipeline', 'runs.json');
    this.restoreFromDisk();
  }

  // ── Mutations ──────────────────────────────────────────────────────

  createRun(opts: CreateRunOpts): PipelineRun {
    const now = new Date().toISOString();
    const steps = this.stepsForLane(opts.lane);
    const run: PipelineRun = {
      run_id: ulid(),
      lane: opts.lane,
      video_id: opts.video_id ?? null,
      product_id: opts.product_id ?? null,
      status: 'pending',
      current_step: null,
      steps_completed: 0,
      steps_total: steps.length,
      started_at: now,
      updated_at: now,
      completed_at: null,
      error: null,
      artifacts: {},
    };
    this.runs.set(run.run_id, run);
    this.logger.info({ run_id: run.run_id, lane: run.lane }, 'run.created');
    this.schedulePersist();
    return run;
  }

  startRun(runId: string): PipelineRun {
    const run = this.mustGet(runId);
    run.status = 'running';
    run.updated_at = new Date().toISOString();
    this.logger.info({ run_id: runId }, 'run.started');
    this.schedulePersist();
    return run;
  }

  startStep(runId: string, step: string): PipelineRun {
    const run = this.mustGet(runId);
    run.current_step = step;
    run.status = 'running';
    run.updated_at = new Date().toISOString();
    this.logger.info({ run_id: runId, step }, 'run.step.started');
    this.schedulePersist();
    return run;
  }

  completeStep(runId: string, step: string, artifact?: { key: string; path: string }): PipelineRun {
    const run = this.mustGet(runId);
    run.steps_completed = Math.min(run.steps_completed + 1, run.steps_total);
    run.updated_at = new Date().toISOString();
    if (artifact) {
      run.artifacts[artifact.key] = artifact.path;
    }
    this.logger.info(
      { run_id: runId, step, progress: `${run.steps_completed}/${run.steps_total}` },
      'run.step.completed',
    );
    this.schedulePersist();
    return run;
  }

  failRun(runId: string, error: string): PipelineRun {
    const run = this.mustGet(runId);
    run.status = 'failed';
    run.error = error;
    run.updated_at = new Date().toISOString();
    this.logger.error({ run_id: runId, error }, 'run.failed');
    this.schedulePersist();
    return run;
  }

  completeRun(runId: string): PipelineRun {
    const run = this.mustGet(runId);
    run.status = 'completed';
    run.current_step = null;
    run.completed_at = new Date().toISOString();
    run.updated_at = run.completed_at;
    this.logger.info({ run_id: runId }, 'run.completed');
    this.schedulePersist();
    return run;
  }

  pauseRun(runId: string): PipelineRun {
    const run = this.mustGet(runId);
    run.status = 'paused';
    run.updated_at = new Date().toISOString();
    this.logger.info({ run_id: runId }, 'run.paused');
    this.schedulePersist();
    return run;
  }

  // ── Queries ────────────────────────────────────────────────────────

  get(runId: string): PipelineRun | null {
    return this.runs.get(runId) ?? null;
  }

  list(opts?: { status?: RunStatus; lane?: RunLane; limit?: number }): readonly PipelineRun[] {
    let runs = [...this.runs.values()];
    if (opts?.status) runs = runs.filter((r) => r.status === opts.status);
    if (opts?.lane) runs = runs.filter((r) => r.lane === opts.lane);
    // Most recent first
    runs.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    if (opts?.limit) runs = runs.slice(0, opts.limit);
    return runs;
  }

  summary(): RunStoreSummary {
    const all = [...this.runs.values()];
    return {
      total: all.length,
      pending: all.filter((r) => r.status === 'pending').length,
      running: all.filter((r) => r.status === 'running').length,
      completed: all.filter((r) => r.status === 'completed').length,
      failed: all.filter((r) => r.status === 'failed').length,
      paused: all.filter((r) => r.status === 'paused').length,
    };
  }

  // ── Persistence ────────────────────────────────────────────────────

  /** Force-write to disk immediately (used before shutdown). */
  flush(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.writeToDisk();
  }

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.writeToDisk();
    }, 500);
    this.persistTimer.unref?.();
  }

  private writeToDisk(): void {
    try {
      const dir = dirname(this.persistPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const data = JSON.stringify([...this.runs.values()], null, 2);
      writeFileSync(this.persistPath, data, 'utf8');
    } catch (err) {
      this.logger.error({ err, path: this.persistPath }, 'run-store.persist.error');
    }
  }

  private restoreFromDisk(): void {
    try {
      if (!existsSync(this.persistPath)) return;
      const raw = readFileSync(this.persistPath, 'utf8');
      const arr = JSON.parse(raw) as PipelineRun[];
      for (const run of arr) {
        this.runs.set(run.run_id, run);
      }
      this.logger.info({ restored: arr.length, path: this.persistPath }, 'run-store.restored');
    } catch (err) {
      this.logger.warn({ err, path: this.persistPath }, 'run-store.restore.error');
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private mustGet(runId: string): PipelineRun {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`run not found: ${runId}`);
    return run;
  }

  private stepsForLane(lane: RunLane): readonly string[] {
    switch (lane) {
      case 'review_product':
        return REVIEW_PRODUCT_STEPS;
      default:
        return REVIEW_PRODUCT_STEPS;
    }
  }
}

export interface RunStoreSummary {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  paused: number;
}

/**
 * Read the persisted runs.json directly from disk — used by the CLI
 * without needing a running kernel process.
 */
export function readRunsFromDisk(dataDir: string): PipelineRun[] {
  const path = join(dataDir, 'pipeline', 'runs.json');
  try {
    if (!existsSync(path)) return [];
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw) as PipelineRun[];
  } catch {
    return [];
  }
}
