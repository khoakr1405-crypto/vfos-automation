/**
 * Run lifecycle events — published on the kernel EventBus so plugins,
 * webhooks, and the status-api can react to pipeline progress in real-time.
 *
 * Event naming follows the existing `<domain>.<action>.v1` convention
 * used by render.completed.v1 and publish.failed.v1.
 */

import type { EventBus } from '../bus/types.js';
import type { PipelineRun, RunStatus } from './run-store.js';

// ── Event Schemas ────────────────────────────────────────────────────────

export const RUN_EVENTS = {
  STARTED: 'run.started.v1',
  STEP_STARTED: 'run.step.started.v1',
  STEP_COMPLETED: 'run.step.completed.v1',
  FAILED: 'run.failed.v1',
  COMPLETED: 'run.completed.v1',
} as const;

export interface RunStartedPayload {
  run_id: string;
  lane: string;
  video_id: string | null;
  product_id: string | null;
  steps_total: number;
}

export interface RunStepPayload {
  run_id: string;
  step: string;
  steps_completed: number;
  steps_total: number;
}

export interface RunFailedPayload {
  run_id: string;
  error: string;
  current_step: string | null;
  steps_completed: number;
}

export interface RunCompletedPayload {
  run_id: string;
  steps_completed: number;
  total_ms: number;
}

// ── Emitter ──────────────────────────────────────────────────────────────

const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001';

export class RunEventEmitter {
  constructor(
    private readonly bus: EventBus,
    private readonly tenantId: string = DEFAULT_TENANT,
  ) {}

  async emitStarted(run: PipelineRun): Promise<void> {
    await this.bus.publish<RunStartedPayload>({
      schema: RUN_EVENTS.STARTED,
      tenant_id: this.tenantId,
      emitter: 'kernel:run-store',
      payload: {
        run_id: run.run_id,
        lane: run.lane,
        video_id: run.video_id,
        product_id: run.product_id,
        steps_total: run.steps_total,
      },
    });
  }

  async emitStepStarted(run: PipelineRun, step: string): Promise<void> {
    await this.bus.publish<RunStepPayload>({
      schema: RUN_EVENTS.STEP_STARTED,
      tenant_id: this.tenantId,
      emitter: 'kernel:run-store',
      payload: {
        run_id: run.run_id,
        step,
        steps_completed: run.steps_completed,
        steps_total: run.steps_total,
      },
    });
  }

  async emitStepCompleted(run: PipelineRun, step: string): Promise<void> {
    await this.bus.publish<RunStepPayload>({
      schema: RUN_EVENTS.STEP_COMPLETED,
      tenant_id: this.tenantId,
      emitter: 'kernel:run-store',
      payload: {
        run_id: run.run_id,
        step,
        steps_completed: run.steps_completed,
        steps_total: run.steps_total,
      },
    });
  }

  async emitFailed(run: PipelineRun): Promise<void> {
    await this.bus.publish<RunFailedPayload>({
      schema: RUN_EVENTS.FAILED,
      tenant_id: this.tenantId,
      emitter: 'kernel:run-store',
      payload: {
        run_id: run.run_id,
        error: run.error ?? 'unknown',
        current_step: run.current_step,
        steps_completed: run.steps_completed,
      },
    });
  }

  async emitCompleted(run: PipelineRun, totalMs: number): Promise<void> {
    await this.bus.publish<RunCompletedPayload>({
      schema: RUN_EVENTS.COMPLETED,
      tenant_id: this.tenantId,
      emitter: 'kernel:run-store',
      payload: {
        run_id: run.run_id,
        steps_completed: run.steps_completed,
        total_ms: totalMs,
      },
    });
  }
}
