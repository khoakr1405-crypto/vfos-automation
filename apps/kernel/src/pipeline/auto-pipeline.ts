/**
 * Auto-Pipeline — Linear DAG Orchestrator for VFOS runs.
 *
 * Sequentially executes registered child steps, updates the P0 Run Store
 * dynamically, triggers the Artifact Gate for validating process output,
 * and handles failures immediately by marking the run as failed.
 */

import type { Logger } from 'pino';
import type { RunStore, RunLane, PipelineRun } from './run-store.js';
import { StepRunner, type StepOutcome } from './step-runner.js';
import { ArtifactGate, type GateReport } from './artifact-gate.js';
import type { StepDefinition } from './step-registry.js';
import { RunEventEmitter } from './run-events.js';
import type { EventBus } from '../bus/types.js';
import { RetryPolicy } from './retry-policy.js';
import { GuardRunner, type Guard } from './guard-runner.js';

export interface PipelineResult {
  run_id: string;
  status: 'completed' | 'failed';
  steps_total: number;
  steps_completed: number;
  failed_step: string | null;
  error: string | null;
  durationMs: number;
  outcomes: StepOutcome[];
}

export interface AutoPipelineOpts {
  logger: Logger;
  runStore: RunStore;
  bus?: EventBus;
  retryPolicy?: RetryPolicy;
  guards?: Guard[];
}

export class AutoPipeline {
  private readonly runner: StepRunner;
  private readonly gate: ArtifactGate;
  private readonly emitter: RunEventEmitter | null = null;
  private readonly retryPolicy: RetryPolicy;
  private readonly guardRunner: GuardRunner;

  constructor(private readonly opts: AutoPipelineOpts) {
    this.runner = new StepRunner(opts.logger);
    this.gate = new ArtifactGate(opts.logger, '.');
    this.retryPolicy = opts.retryPolicy ?? new RetryPolicy();
    this.guardRunner = new GuardRunner(opts.logger);
    if (opts.bus) {
      this.emitter = new RunEventEmitter(opts.bus);
    }
  }

  /**
   * Runs a configured sequence of step definitions linearly.
   * Updates RunStore in real-time. Never throws; returns structured PipelineResult.
   */
  async execute(
    lane: RunLane,
    steps: StepDefinition[],
    metaOpts: { video_id?: string; product_id?: string } = {},
  ): Promise<PipelineResult> {
    const startTime = performance.now();
    const outcomes: StepOutcome[] = [];

    // 1. Create run state in store
    const createOpts: { lane: RunLane; video_id?: string; product_id?: string } = { lane };
    if (metaOpts.video_id !== undefined) createOpts.video_id = metaOpts.video_id;
    if (metaOpts.product_id !== undefined) createOpts.product_id = metaOpts.product_id;

    const run = this.opts.runStore.createRun(createOpts);
    const runId = run.run_id;

    if (this.emitter) {
      void this.emitter.emitStarted(run).catch(() => {});
    }

    // 2. Start running
    this.opts.runStore.startRun(runId);

    let failedStep: string | null = null;
    let error: string | null = null;
    let pipelineStatus: 'completed' | 'failed' = 'completed';

    // 3. Sequential loop execution
    for (const step of steps) {
      // Check current state to ensure process isn't terminated / paused externally
      const currentRun = this.opts.runStore.get(runId);
      if (!currentRun || currentRun.status === 'paused') {
        failedStep = step.stepName;
        error = 'Pipeline execution paused/cancelled externally';
        pipelineStatus = 'failed';
        break;
      }

      // Update RunStore & Emit: Step Started
      this.opts.runStore.startStep(runId, step.stepName);
      if (this.emitter) {
        void this.emitter.emitStepStarted(currentRun, step.stepName).catch(() => {});
      }

      let attempt = 1;
      const maxAttempts = this.retryPolicy.getMaxAttempts();
      let outcome: StepOutcome | null = null;

      while (attempt <= maxAttempts) {
        if (attempt > 1) {
          const delay = this.retryPolicy.calculateDelay(attempt);
          this.opts.logger.warn(
            { step: step.stepName, attempt, maxAttempts, delayMs: delay },
            'step.retry.waiting',
          );
          await new Promise((r) => setTimeout(r, delay));
        }

        // Execute Child Command
        outcome = await this.runner.run(step);
        outcomes.push(outcome);

        if (outcome.status === 'success') {
          break;
        }

        // Step failed. Classify error to decide if retryable
        const classification = this.retryPolicy.classify(outcome.exitCode, outcome.stderr);
        if (classification === 'non_retryable') {
          this.opts.logger.error(
            { step: step.stepName, attempt, classification },
            'step.failed.non_retryable',
          );
          break;
        }

        if (attempt === maxAttempts) {
          this.opts.logger.error(
            { step: step.stepName, attempt, maxAttempts },
            'step.failed.max_attempts_reached',
          );
          break;
        }

        this.opts.logger.warn(
          { step: step.stepName, attempt, classification },
          'step.failed.retryable',
        );
        attempt++;
      }

      // Handle final step failures after attempts exhaust
      if (!outcome || outcome.status !== 'success') {
        failedStep = step.stepName;
        error = `Process ${outcome?.status ?? 'failed'} (exit code ${outcome?.exitCode ?? 'unknown'}, attempt ${attempt}/${maxAttempts}). stderr: ${outcome?.stderr.trim() ?? ''}`;
        pipelineStatus = 'failed';
        break;
      }

      // Validate outputs via Artifact Gate
      const gateReport = this.gate.validate(step.expectedArtifacts);
      if (!gateReport.passed) {
        failedStep = step.stepName;
        const failedFile = gateReport.validations.find((v) => !v.valid);
        error = `Artifact validation failed for: ${failedFile?.path || 'unknown'} (${failedFile?.reason || 'unspecified'})`;
        pipelineStatus = 'failed';
        break;
      }

      // Execute Quality Guards if configured
      const stepGuards = (this.opts.guards || []).filter((g) => g.targetStep === step.stepName);
      if (stepGuards.length > 0) {
        const guardResult = await this.guardRunner.run(
          step.stepName,
          step.expectedArtifacts,
          stepGuards,
        );
        if (!guardResult.passed) {
          failedStep = step.stepName;
          const firstBlocking = guardResult.blockingFailures[0];
          error = `[Guard Violation] ${firstBlocking?.guardName || 'unknown'} failed for ${step.stepName}: ${firstBlocking?.reasons.join(', ') || 'blocking failure'}`;
          pipelineStatus = 'failed';
          break;
        }
      }

      // Step completed successfully
      // Add first artifact to run artifacts object if available
      const primaryArtifact = step.expectedArtifacts[0];
      const artifactObj = primaryArtifact
        ? { key: step.stepName.replace(':', '_') + '_artifact', path: primaryArtifact }
        : undefined;

      this.opts.runStore.completeStep(runId, step.stepName, artifactObj);
      if (this.emitter) {
        void this.emitter.emitStepCompleted(currentRun, step.stepName).catch(() => {});
      }
    }

    const durationMs = Math.round(performance.now() - startTime);

    // 4. Finalize run outcome
    if (pipelineStatus === 'failed') {
      const errMessage = error ?? 'Unknown error';
      this.opts.runStore.failRun(runId, errMessage);
      if (this.emitter) {
        const finalRun = this.opts.runStore.get(runId);
        if (finalRun) {
          void this.emitter.emitFailed(finalRun).catch(() => {});
        }
      }
    } else {
      this.opts.runStore.completeRun(runId);
      if (this.emitter) {
        const finalRun = this.opts.runStore.get(runId);
        if (finalRun) {
          void this.emitter.emitCompleted(finalRun, durationMs).catch(() => {});
        }
      }
    }

    const finalRunState = this.opts.runStore.get(runId);

    return {
      run_id: runId,
      status: pipelineStatus,
      steps_total: steps.length,
      steps_completed: finalRunState ? finalRunState.steps_completed : 0,
      failed_step: failedStep,
      error,
      durationMs,
      outcomes,
    };
  }
}
