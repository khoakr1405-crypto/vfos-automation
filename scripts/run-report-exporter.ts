/**
 * Run Report Exporter Utility — Round P18.
 *
 * Compiles and exports structured run reports in JSON and Markdown formats
 * to capture pipeline execution status, quality guards, and artifacts.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface ExportRunReportOpts {
  manifestPath: string;
  runtimeManifestPath: string;
  planPath: string;
  outputDir: string;
  plan: any;
  result: {
    run_id: string;
    status: string;
    steps_completed: number;
    steps_total: number;
    failed_step?: string | null;
    error?: string | null;
  };
  targetMode: string;
  durationMs: number;
  isDryRun: boolean;
}

export function exportRunReport(opts: ExportRunReportOpts): void {
  const {
    manifestPath,
    runtimeManifestPath,
    planPath,
    outputDir,
    plan,
    result,
    targetMode,
    durationMs,
    isDryRun,
  } = opts;

  // 1. Ensure output directory exists
  try {
    mkdirSync(outputDir, { recursive: true });
  } catch (err: any) {
    console.error(`[ReportExporter] ERROR: Failed to create output directory ${outputDir}: ${err.message}`);
    return;
  }

  const generatedAt = new Date().toISOString();
  const runId = result.run_id || 'dry_run_id';
  const steps = plan.steps || [];

  // Determine failed step index if failed
  let failedStepIndex = -1;
  if (result.failed_step) {
    failedStepIndex = steps.findIndex((s: any) => s.stepName === result.failed_step);
  }

  // 2. Parse steps, artifacts, and guards lists
  const reportSteps: any[] = [];
  const reportArtifacts: any[] = [];
  const reportGuards: any[] = [];

  steps.forEach((step: any, index: number) => {
    // Determine step status
    let stepStatus = 'skipped';
    if (isDryRun) {
      stepStatus = 'dry_run';
    } else if (result.status === 'completed' || !result.failed_step) {
      stepStatus = 'success';
    } else if (result.failed_step === step.stepName) {
      stepStatus = 'failed';
    } else if (failedStepIndex !== -1 && index < failedStepIndex) {
      stepStatus = 'success';
    }

    // Expected artifacts paths
    const expectedArtifactsList = (step.expectedArtifacts || []).map((art: any) => art.path);

    reportSteps.push({
      stepName: step.stepName,
      status: stepStatus,
      expectedArtifacts: expectedArtifactsList,
      guards: (step.guards || []).map((g: any) => g.guardName),
    });

    // Check artifact existence
    (step.expectedArtifacts || []).forEach((art: any) => {
      const artifactPath = art.path;
      const name = artifactPath.split(/[\\/]/).pop()?.replace('.json', '') || 'artifact';
      const exists = existsSync(artifactPath);

      reportArtifacts.push({
        name,
        path: artifactPath,
        exists,
      });
    });

    // Guards summary
    (step.guards || []).forEach((g: any) => {
      reportGuards.push({
        guardName: g.guardName,
        stepName: step.stepName,
        blocking: g.blocking !== false,
      });
    });
  });

  // 3. Determine if preview artifact exists and meets security constraints (only if render-video succeeded or we are in completed run)
  const renderVideoStep = reportSteps.find((s: any) => s.stepName === 'demo:render-video');
  const isRenderVideoSuccess = isDryRun ? false : (renderVideoStep ? renderVideoStep.status === 'success' : false);

  const previewArtifactPath = join(outputDir, 'preview_artifact.json');
  let isReadyForReview = false;
  let previewMeta: any = null;

  if (isRenderVideoSuccess && existsSync(previewArtifactPath)) {
    try {
      previewMeta = JSON.parse(readFileSync(previewArtifactPath, 'utf8'));
      if (
        previewMeta.requiresOperatorReview === true &&
        previewMeta.readyForPublish === false &&
        previewMeta.offlinePlaceholderOnly === true
      ) {
        isReadyForReview = true;
      }
    } catch (e) {}
  }

  // 4. Compute recommended next action
  let recommendedNextAction = 'Review plan summary before executing the run.';
  let overallStatus = 'dry_run';

  if (!isDryRun) {
    if (result.status === 'completed') {
      overallStatus = 'completed';
      if (isReadyForReview) {
        recommendedNextAction = 'Preview is ready for operator review. Test the video before any publish step.';
      } else {
        recommendedNextAction = 'Ready for production render pipeline.';
      }
    } else {
      overallStatus = 'failed';
      // Determine if failed due to guard violation or generic command failure
      const isGuardViolation = result.error?.includes('[Guard Violation]') || false;
      if (isGuardViolation) {
        recommendedNextAction = 'Review quality guard issues and adjust manifest/lane inputs before retry.';
      } else {
        recommendedNextAction = 'Inspect failed step stderr and artifact outputs before retry.';
      }
    }
  }

  // 5. Determine operator review state block
  let operatorReviewState = 'NOT_READY';
  if (isDryRun) {
    operatorReviewState = 'DRY_RUN_PLAN_ONLY';
  } else if (isReadyForReview) {
    operatorReviewState = 'READY_FOR_OPERATOR_REVIEW';
  }

  const operatorReviewBlock = {
    state: operatorReviewState,
    requiresReview: isReadyForReview,
    previewArtifactPath: isReadyForReview ? previewArtifactPath : null,
    expectedPreviewPath: isReadyForReview ? (previewMeta?.expectedPreviewPath || null) : null,
    readyForPublish: false,
    message: isDryRun 
      ? 'Dry-run plan only. No steps executed.'
      : (isReadyForReview 
          ? 'Preview is ready for operator review. Do not publish until explicitly approved.'
          : 'Preview was not generated. Fix failed step before operator review.')
  };

  // 6. Formulate JSON Report
  const jsonReport = {
    reportVersion: 'v1',
    generatedAt,
    run: {
      runId,
      subject: plan.subject || 'unknown',
      lane: plan.laneName || 'review_product',
      mode: targetMode,
      status: overallStatus,
      operatorReviewState, // Added top-level field for backwards compatibility safety
      stepsCompleted: isDryRun ? 0 : result.steps_completed,
      stepsTotal: steps.length,
      failedStep: isDryRun ? null : (result.failed_step || null),
      error: isDryRun ? null : (result.error || null),
      durationMs,
    },
    paths: {
      manifestPath,
      runtimeManifestPath,
      planPath,
      outputDir,
    },
    steps: reportSteps,
    artifacts: reportArtifacts,
    guards: reportGuards,
    operatorReview: operatorReviewBlock,
    recommendedNextAction,
  };

  // 7. Formulate Operator Review Markdown block
  let operatorReviewMarkdown = '';
  if (isDryRun) {
    operatorReviewMarkdown = `
## Operator Review
**State**: DRY_RUN_PLAN_ONLY

No steps were executed. Review the plan before running.
`;
  } else if (isReadyForReview) {
    operatorReviewMarkdown = `
## Operator Review
**State**: READY_FOR_OPERATOR_REVIEW

**Preview Artifact**: \`${previewArtifactPath}\`

**Expected Preview Path**: \`${previewMeta?.expectedPreviewPath || 'None'}\`

**Required Action**:
Operator must review/test the preview video before any publish step is allowed.

**Safety Rule**:
Do not publish to Facebook automatically after render.
`;
  } else {
    operatorReviewMarkdown = `
## Operator Review
**State**: NOT_READY

Preview was not generated. Fix failed step before operator review.
`;
  }

  // 8. Formulate Markdown Report
  const mdReport = `# VFOS Run Report

## Summary
- **Run ID**: ${jsonReport.run.runId}
- **Lane**: ${jsonReport.run.lane}
- **Subject**: ${jsonReport.run.subject}
- **Status**: ${jsonReport.run.status.toUpperCase()}
- **Steps**: ${jsonReport.run.stepsCompleted} / ${jsonReport.run.stepsTotal} completed
- **Failed Step**: ${jsonReport.run.failedStep || 'None'}
- **Error**: ${jsonReport.run.error ? `\`${jsonReport.run.error}\`` : 'None'}
- **Duration**: ${jsonReport.run.durationMs}ms
- **Generated At**: ${generatedAt}

## Paths
- **Original Manifest**: [manifest](${resolve(manifestPath)})
- **Runtime Manifest**: [runtime_manifest](${resolve(runtimeManifestPath)})
- **Pipeline Plan**: [plan](${resolve(planPath)})
- **Output Dir**: [output_dir](${resolve(outputDir)})
${operatorReviewMarkdown}
## Steps
| # | Step Name | Status | Artifacts | Guards |
|---|-----------|--------|-----------|--------|
${reportSteps
  .map(
    (s, i) =>
      `| ${i + 1} | \`${s.stepName}\` | ${s.status === 'success' ? '✅ success' : s.status === 'failed' ? '❌ failed' : s.status === 'skipped' ? '⏭️ skipped' : '📝 dry_run'} | ${
        s.expectedArtifacts.length > 0 ? s.expectedArtifacts.map((a: string) => `\`${a.split(/[\\/]/).pop()}\``).join(', ') : 'None'
      } | ${s.guards.length > 0 ? s.guards.map((g: string) => `\`${g}\``).join(', ') : 'None'} |`
  )
  .join('\n')}

## Artifacts
| Artifact | Path | Exists |
|----------|------|--------|
${reportArtifacts
  .map(
    (a) =>
      `| \`${a.name}\` | \`${a.path}\` | ${a.exists ? '🟢 Yes' : '🔴 No'} |`
  )
  .join('\n')}

## Guards
| Guard | Step | Blocking |
|-------|------|----------|
${reportGuards
  .map(
    (g) =>
      `| \`${g.guardName}\` | \`${g.stepName}\` | ${g.blocking ? 'Yes' : 'No'} |`
  )
  .join('\n')}

## Recommended Next Action
> [!IMPORTANT]
> **${recommendedNextAction}**
`;

  // 9. Write reports to files
  const jsonReportPath = join(outputDir, 'run_report.json');
  const mdReportPath = join(outputDir, 'run_report.md');

  try {
    writeFileSync(jsonReportPath, JSON.stringify(jsonReport, null, 2), 'utf8');
    writeFileSync(mdReportPath, mdReport, 'utf8');

    console.log('\n  [Operator] Exported run report:');
    console.log(`  - JSON:      ${jsonReportPath}`);
    console.log(`  - Markdown:  ${mdReportPath}`);
  } catch (err: any) {
    console.error(`[ReportExporter] ERROR: Failed to write reports: ${err.message}`);
  }
}
