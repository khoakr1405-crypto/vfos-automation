/**
 * Step Runner — Executing child process commands with monitoring.
 *
 * Runs production script commands asynchronously under the hood,
 * measuring execution time, capturing stdout/stderr, and enforcing
 * timeouts. Returns clean structured outcomes without throwing
 * unexpected exceptions.
 */

import { spawn } from 'node:child_process';
import type { Logger } from 'pino';
import type { StepDefinition } from './step-registry.js';

export interface StepOutcome {
  stepName: string;
  status: 'success' | 'failed' | 'timeout';
  exitCode: number | null;
  stdout: string;
  stderr: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export class StepRunner {
  constructor(private readonly logger: Logger) {}

  /**
   * Spawns a child process to run the configured step.
   * Resolves with a detailed, structured outcome. Never rejects.
   */
  async run(step: StepDefinition): Promise<StepOutcome> {
    const startedAt = new Date().toISOString();
    const startTime = performance.now();
    this.logger.info({ step: step.stepName, command: `${step.command} ${step.args.join(' ')}` }, 'step-runner.spawn.start');

    return new Promise<StepOutcome>((resolve) => {
      let stdout = '';
      let stderr = '';
      let killedByTimeout = false;

      // Spawn child process with safety settings
      const proc = spawn(step.command, step.args, {
        cwd: step.cwd,
        shell: true, // Use shell to ensure command path / pnpm aliases resolve cleanly on Windows/Unix
      });

      // Timeout safety mechanism
      const timer = setTimeout(() => {
        killedByTimeout = true;
        this.logger.warn({ step: step.stepName, timeoutMs: step.timeoutMs }, 'step-runner.timeout.exceeded');
        try {
          proc.kill('SIGTERM');
          // Windows compatibility fallback: force kill if SIGTERM is ignored
          setTimeout(() => {
            if (proc.exitCode === null) {
              proc.kill('SIGKILL');
            }
          }, 2000).unref?.();
        } catch (err) {
          this.logger.error({ err, step: step.stepName }, 'step-runner.timeout.kill.failed');
        }
      }, step.timeoutMs);

      // Data streams buffering
      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        const finishedAt = new Date().toISOString();
        const durationMs = Math.round(performance.now() - startTime);
        this.logger.error({ err, step: step.stepName }, 'step-runner.process.error');

        resolve({
          stepName: step.stepName,
          status: 'failed',
          exitCode: null,
          stdout,
          stderr: stderr + `\nProcess error: ${err.message}`,
          startedAt,
          finishedAt,
          durationMs,
        });
      });

      proc.on('exit', (code, signal) => {
        clearTimeout(timer);
        const finishedAt = new Date().toISOString();
        const durationMs = Math.round(performance.now() - startTime);

        let status: StepOutcome['status'] = 'success';
        if (killedByTimeout || signal === 'SIGTERM' || signal === 'SIGKILL') {
          status = 'timeout';
        } else if (code !== 0) {
          status = 'failed';
        }

        this.logger.info(
          { step: step.stepName, status, code, durationMs },
          'step-runner.process.exited',
        );

        resolve({
          stepName: step.stepName,
          status,
          exitCode: code,
          stdout,
          stderr,
          startedAt,
          finishedAt,
          durationMs,
        });
      });
    });
  }
}
