import { readFileSync, existsSync } from 'node:fs';
import type { Logger } from 'pino';
import type { RunStore, RunLane, PipelineRun } from './run-store.js';
import { StepRunner, type StepOutcome } from './step-runner.js';
import { ArtifactGate, type GateReport } from './artifact-gate.js';
import type { StepDefinition } from './step-registry.js';
import { RunEventEmitter } from './run-events.js';
import type { EventBus } from '../bus/types.js';
import { RetryPolicy } from './retry-policy.js';
import { GuardRunner, type Guard } from './guard-runner.js';
import type { PipelinePlan, PlanStepDefinition } from './plan-builder.js';

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

  /**
   * Loads and runs a pipeline plan declared in a pipeline_plan.json file.
   * Leverages existing pipeline execution lifecycle, events, retries, and quality gates.
   */
  async executeFromPlan(
    planPath: string,
    metaOpts: { video_id?: string; product_id?: string } = {},
  ): Promise<PipelineResult> {
    const startTime = performance.now();

    // 1. Load Plan File
    if (!existsSync(planPath)) {
      return {
        run_id: 'unknown_run',
        status: 'failed',
        steps_total: 0,
        steps_completed: 0,
        failed_step: null,
        error: `Plan file not found at: ${planPath}`,
        durationMs: 0,
        outcomes: [],
      };
    }

    let plan: PipelinePlan;
    try {
      plan = JSON.parse(readFileSync(planPath, 'utf8'));
    } catch (err: any) {
      return {
        run_id: 'unknown_run',
        status: 'failed',
        steps_total: 0,
        steps_completed: 0,
        failed_step: null,
        error: `Failed to parse plan JSON: ${err.message}`,
        durationMs: 0,
        outcomes: [],
      };
    }

    // 2. Validate Plan Structure
    if (
      !plan.planVersion ||
      !plan.lane ||
      !plan.runId ||
      !plan.steps ||
      !Array.isArray(plan.steps) ||
      plan.steps.length === 0
    ) {
      return {
        run_id: plan.runId || 'invalid_plan_run',
        status: 'failed',
        steps_total: 0,
        steps_completed: 0,
        failed_step: null,
        error: 'Invalid pipeline plan structure: must contain planVersion, lane, runId, and non-empty steps.',
        durationMs: 0,
        outcomes: [],
      };
    }

    // 3. Create run state in store using plan metadata
    const runId = plan.runId;
    const lane = plan.lane as RunLane;

    const createOpts: { lane: RunLane; video_id?: string; product_id?: string } = { lane };
    if (metaOpts.video_id !== undefined) createOpts.video_id = metaOpts.video_id;
    else if (plan.subject !== undefined) createOpts.video_id = plan.subject;

    if (metaOpts.product_id !== undefined) createOpts.product_id = metaOpts.product_id;

    const run = this.opts.runStore.createRun(createOpts);
    const generatedId = run.run_id;
    run.run_id = runId;
    (this.opts.runStore as any).runs.delete(generatedId);
    (this.opts.runStore as any).runs.set(runId, run);

    if (this.emitter) {
      void this.emitter.emitStarted(run).catch(() => {});
    }

    // Start executing
    this.opts.runStore.startRun(runId);

    let failedStep: string | null = null;
    let error: string | null = null;
    let pipelineStatus: 'completed' | 'failed' = 'completed';
    const outcomes: StepOutcome[] = [];

    // 4. Execute sequential steps defined in plan
    for (const planStep of plan.steps) {
      // Check current state to ensure process isn't terminated / paused externally
      const currentRun = this.opts.runStore.get(runId);
      if (!currentRun || currentRun.status === 'paused') {
        failedStep = planStep.stepName;
        error = 'Pipeline execution paused/cancelled externally';
        pipelineStatus = 'failed';
        break;
      }

      // Convert Plan Step to StepDefinition format expected by StepRunner/ArtifactGate
      const step: StepDefinition = {
        stepName: planStep.stepName,
        command: planStep.command,
        args: planStep.args,
        cwd: planStep.cwd,
        timeoutMs: planStep.timeoutMs,
        expectedArtifacts: planStep.expectedArtifacts.map((a) => a.path),
        description: planStep.description || '',
      };

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

        // Execute step command
        outcome = await this.runner.run(step);
        outcomes.push(outcome);

        if (outcome.status === 'success') {
          break;
        }

        // Handle failure classification for retries
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

      // Handle final step failure after retries
      if (!outcome || outcome.status !== 'success') {
        failedStep = step.stepName;
        error = `Process ${outcome?.status ?? 'failed'} (exit code ${outcome?.exitCode ?? 'unknown'}, attempt ${attempt}/${maxAttempts}). stderr: ${outcome?.stderr.trim() ?? ''}`;
        pipelineStatus = 'failed';
        break;
      }

      // Validate artifacts using ArtifactGate
      const gateReport = this.gate.validate(step.expectedArtifacts);
      if (!gateReport.passed) {
        failedStep = step.stepName;
        const failedFile = gateReport.validations.find((v) => !v.valid);
        error = `Artifact validation failed for: ${failedFile?.path || 'unknown'} (${failedFile?.reason || 'unspecified'})`;
        pipelineStatus = 'failed';
        break;
      }

      // Execute plan-specified Quality Guards dynamically
      const planGuards = planStep.guards || [];
      if (planGuards.length > 0) {
        // Resolve actual guard instances from opts.guards by constructor name
        const resolvedGuards = planGuards
          .map((pgSpec) => {
            const instance = (this.opts.guards || []).find(
              (g) => g.constructor.name === pgSpec.guardName,
            );
            return instance;
          })
          .filter((g): g is Guard => g !== undefined);

        if (resolvedGuards.length > 0) {
          const guardResult = await this.guardRunner.run(
            step.stepName,
            step.expectedArtifacts,
            resolvedGuards,
          );
          if (!guardResult.passed) {
            failedStep = step.stepName;
            const firstBlocking = guardResult.blockingFailures[0];
            error = `[Guard Violation] ${firstBlocking?.guardName || 'unknown'} failed for ${step.stepName}: ${firstBlocking?.reasons.join(', ') || 'blocking failure'}`;
            pipelineStatus = 'failed';
            break;
          }
        }
      }

      // Step completed successfully
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

    // 5. Finalize run outcome
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
      steps_total: plan.steps.length,
      steps_completed: finalRunState ? finalRunState.steps_completed : 0,
      failed_step: failedStep,
      error,
      durationMs,
      outcomes,
    };
  }
}
