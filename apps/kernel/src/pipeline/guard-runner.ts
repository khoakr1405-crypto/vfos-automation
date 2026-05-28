/**
 * Guard Runner — Extensible Gatekeeper for step artifact quality validation.
 *
 * Runs semantic, structural, and sanity verification routines against step output artifacts.
 * Prevents downstream execution if critical quality gates are violated (blocking failures).
 */

import type { Logger } from 'pino';

export interface GuardReport {
  guardName: string;
  targetStep: string;
  artifactPath: string;
  status: 'pass' | 'warn' | 'fail';
  severity: 'info' | 'warning' | 'blocking';
  reasons: string[];
  details?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export interface GuardResult {
  passed: boolean;
  guardReports: GuardReport[];
  blockingFailures: GuardReport[];
}

export interface Guard {
  guardName: string;
  targetStep: string;
  validate(artifactPath: string): Promise<Omit<GuardReport, 'startedAt' | 'finishedAt' | 'durationMs' | 'artifactPath'>>;
}

export class GuardRunner {
  constructor(private readonly logger: Logger) {}

  /**
   * Run a set of configured Guard instances against step artifacts.
   */
  async run(
    stepName: string,
    artifactPaths: string[],
    guards: Guard[],
  ): Promise<GuardResult> {
    const startedAt = new Date().toISOString();
    const guardReports: GuardReport[] = [];
    this.logger.info({ stepName, guardCount: guards.length }, 'guard-runner.start');

    for (const guard of guards) {
      // Find matching artifact based on target configuration or default to first
      const artifactPath = artifactPaths[0] || '';

      const startTime = performance.now();
      const started = new Date().toISOString();

      try {
        const validation = await guard.validate(artifactPath);
        const durationMs = Math.round(performance.now() - startTime);
        const finished = new Date().toISOString();

        const report: GuardReport = {
          guardName: guard.guardName,
          targetStep: guard.targetStep,
          artifactPath,
          status: validation.status,
          severity: validation.severity,
          reasons: validation.reasons,
          startedAt: started,
          finishedAt: finished,
          durationMs,
        };
        if (validation.details !== undefined) {
          report.details = validation.details;
        }

        guardReports.push(report);

        if (report.status === 'fail') {
          this.logger.warn(
            { guardName: guard.guardName, severity: report.severity, reasons: report.reasons },
            'guard-runner.check.violation',
          );
        } else {
          this.logger.info(
            { guardName: guard.guardName, status: report.status },
            'guard-runner.check.passed',
          );
        }
      } catch (err) {
        const durationMs = Math.round(performance.now() - startTime);
        const finished = new Date().toISOString();

        const report: GuardReport = {
          guardName: guard.guardName,
          targetStep: guard.targetStep,
          artifactPath,
          status: 'fail',
          severity: 'blocking',
          reasons: ['Execution error within guard validator.'],
          details: err instanceof Error ? err.message : String(err),
          startedAt: started,
          finishedAt: finished,
          durationMs,
        };
        guardReports.push(report);
        this.logger.error({ guardName: guard.guardName, err }, 'guard-runner.execution.error');
      }
    }

    const blockingFailures = guardReports.filter(
      (r) => r.status === 'fail' && r.severity === 'blocking',
    );
    const passed = blockingFailures.length === 0;

    this.logger.info(
      { passed, reports: guardReports.length, blocking: blockingFailures.length },
      'guard-runner.finished',
    );

    return {
      passed,
      guardReports,
      blockingFailures,
    };
  }
}
