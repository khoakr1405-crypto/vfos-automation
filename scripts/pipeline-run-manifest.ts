/**
 * Unified Operator CLI — Run Manifest Operator Gateway.
 *
 * Command: pnpm pipeline:run-manifest -- --manifest <path> [--mode <mode>] [--dry-run] [--print-plan] [--help]
 *
 * Zero live APIs, 100% safe, high-reliability validation gateway.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { RunStore } from '../apps/kernel/src/pipeline/run-store.js';
import { AutoPipeline } from '../apps/kernel/src/pipeline/auto-pipeline.js';
import { ProductMatchGuard } from '../apps/kernel/src/pipeline/guards/product-match-guard.js';
import { VisualGuard } from '../apps/kernel/src/pipeline/guards/visual-guard.js';
import { ScriptGuard } from '../apps/kernel/src/pipeline/guards/script-guard.js';
import { PlanBuilder } from '../apps/kernel/src/pipeline/plan-builder.js';
import { exportRunReport } from './run-report-exporter.js';

function printHelp() {
  console.log(`
  ======================================================
  🛡️    VFOS Operator CLI Gateway — Help Directory      
  ======================================================
  Usage:
    pnpm pipeline:run-manifest -- --manifest <path> [options]

  Required Arguments:
    --manifest <path>     Path to the Run Manifest JSON file.

  Optional Arguments:
    --mode <mode>         Override the manifest runtime execution mode.
                          Supported: "pass", "product-fail", "visual-fail".
    --dry-run             Generate plan and compile specs without running steps.
    --print-plan          Print plan specifications and step descriptions.
    --help                Display this operator help menu.

  Examples:
    pnpm pipeline:run-manifest -- --manifest apps/kernel/config/manifests/review_product_run_manifest.json
    pnpm pipeline:run-manifest -- --manifest apps/kernel/config/manifests/review_product_run_manifest.json --mode visual-fail
  ======================================================
  `);
}

// 1. Parse Command Arguments
let args: any;
try {
  args = parseArgs({
    options: {
      manifest: { type: 'string' },
      mode: { type: 'string' },
      'dry-run': { type: 'boolean' },
      'print-plan': { type: 'boolean' },
      help: { type: 'boolean' },
    },
    allowPositionals: false,
    strict: true,
  });
} catch (err: any) {
  console.error(`ERROR: ${err.message}`);
  printHelp();
  process.exit(1);
}

const { values } = args;

if (values.help) {
  printHelp();
  process.exit(0);
}

if (!values.manifest) {
  console.error('ERROR: Missing mandatory option "--manifest <path>"\n');
  printHelp();
  process.exit(1);
}

const manifestPath = values.manifest;
const resolvedManifestPath = join(process.cwd(), manifestPath);

if (!existsSync(resolvedManifestPath)) {
  console.error(`ERROR: Run Manifest file not found at: ${resolvedManifestPath}`);
  process.exit(1);
}

// Setup basic log wrapper matching Kernel formats
const logger = {
  info: (obj: any, msg: string) => console.log(`[INFO] ${msg}`, obj ? JSON.stringify(obj) : ''),
  debug: (obj: any, msg: string) => {},
  warn: (obj: any, msg: string) => console.warn(`[WARN] ${msg}`, obj ? JSON.stringify(obj) : ''),
  error: (obj: any, msg: string) => console.error(`[ERROR] ${msg}`, obj ? JSON.stringify(obj) : ''),
} as any;

async function main() {
  console.log('\n  ======================================================');
  console.log('  🛡️    VFOS Operator CLI Gateway — Execution Initiated ');
  console.log('  ======================================================');

  // 2. Read original manifest content to parse subject and runId
  let originalManifest: any;
  try {
    originalManifest = JSON.parse(readFileSync(resolvedManifestPath, 'utf8'));
  } catch (err: any) {
    console.error(`ERROR: Failed to parse Run Manifest JSON: ${err.message}`);
    process.exit(1);
  }

  const runId = originalManifest.runId || 'unknown_run';
  const targetMode = values.mode || originalManifest.mode || 'pass';

  let activeManifestPath = manifestPath;

  // 3. Process Mode Override (if specified, write a temporary runtime manifest copy)
  if (values.mode) {
    console.log(`  [Operator] Mode override requested: "${values.mode}"`);
    const runtimeCopyDir = join(process.cwd(), 'data/temp/pipeline-run-manifest', runId);
    mkdirSync(runtimeCopyDir, { recursive: true });

    const overrideManifest = {
      ...originalManifest,
      mode: values.mode,
    };

    const overridePath = join(runtimeCopyDir, 'run_manifest_override.json');
    writeFileSync(overridePath, JSON.stringify(overrideManifest, null, 2), 'utf8');
    console.log(`  [Operator] Created temporary override manifest copy: ${overridePath}`);
    activeManifestPath = `data/temp/pipeline-run-manifest/${runId}/run_manifest_override.json`;
  }

  // 4. Generate plan via PlanBuilder
  const planBuilder = new PlanBuilder('.');
  console.log(`  [Operator] Generating pipeline_plan.json from: ${activeManifestPath}`);

  let buildResult: any;
  try {
    buildResult = planBuilder.buildPlanFromManifest(activeManifestPath, {
      mode: targetMode as any,
    });
  } catch (err: any) {
    console.error(`\n[FATAL ERROR] Plan Generation Failed: ${err.message}`);
    console.log('  ======================================================\n');
    process.exit(1);
  }

  // Read generated plan
  const plan: any = JSON.parse(readFileSync(buildResult.planPath, 'utf8'));

  // Print Operator Summary
  console.log('\n  --- Run Specification Report ---');
  console.log(`  - Manifest Path:    ${manifestPath}`);
  console.log(`  - Lane type:        ${plan.lane}`);
  console.log(`  - Run ID:           ${plan.runId}`);
  console.log(`  - Subject name:     ${plan.subject}`);
  console.log(`  - Target output:    ${plan.outputDir}`);
  console.log(`  - Plan Path:        ${buildResult.planPath}`);
  console.log(`  - Step Count:       ${buildResult.stepCount}`);

  // 5. Print Plan steps if requested
  if (values['print-plan']) {
    console.log('\n  --- Configured Pipeline Steps ---');
    plan.steps.forEach((step: any, index: number) => {
      console.log(`    Step ${index + 1}: ${step.stepName}`);
      console.log(`      Description: ${step.description}`);
      console.log(`      Command:     ${step.command} ${step.args.join(' ')}`);
      if (step.expectedArtifacts?.length > 0) {
        console.log(`      Artifacts:   ${step.expectedArtifacts.map((a: any) => a.path).join(', ')}`);
      }
      if (step.guards?.length > 0) {
        console.log(`      Guards:      ${step.guards.map((g: any) => g.guardName).join(', ')}`);
      }
    });
  }

  // 6. Handle Dry Run exit
  if (values['dry-run']) {
    exportRunReport({
      manifestPath,
      runtimeManifestPath: activeManifestPath,
      planPath: buildResult.planPath,
      outputDir: plan.outputDir,
      plan,
      result: {
        run_id: 'dry_run_id',
        status: 'dry_run',
        steps_completed: 0,
        steps_total: buildResult.stepCount,
        failed_step: null,
        error: null,
      },
      targetMode,
      durationMs: 0,
      isDryRun: true,
    });

    console.log('\n  [Operator] Dry-run check completed! Plan successfully generated.');
    console.log('  ======================================================\n');
    process.exit(0);
  }

  // 7. Execute Pipeline
  const runStore = new RunStore(logger, { dataDir: './data' });
  const productGuard = new ProductMatchGuard();
  const visualGuard = new VisualGuard();
  const defaultScriptGuard = new ScriptGuard();
  const customScriptGuard = new ScriptGuard({ targetStep: 'demo:script-generate' });

  const pipeline = new AutoPipeline({
    logger,
    runStore,
    guards: [productGuard, visualGuard, defaultScriptGuard, customScriptGuard],
  });

  console.log('\n  [Operator] Executing multi-step validation workflow...');
  const startTime = Date.now();
  const result = await pipeline.executeFromPlan(buildResult.planPath);
  const durationMs = Date.now() - startTime;
  runStore.flush();

  // Export report
  exportRunReport({
    manifestPath,
    runtimeManifestPath: activeManifestPath,
    planPath: buildResult.planPath,
    outputDir: plan.outputDir,
    plan,
    result,
    targetMode,
    durationMs,
    isDryRun: false,
  });

  // Print Final Report
  console.log('\n  --- Execution Outcome Report ---');
  console.log(`  - Run ID:           ${result.run_id}`);
  console.log(`  - Status:           ${result.status === 'completed' ? '✅ COMPLETED' : '❌ FAILED'}`);
  console.log(`  - Progress:         ${result.steps_completed}/${result.steps_total} steps completed`);

  if (result.failed_step) {
    console.log(`  - Failed Step:      ${result.failed_step}`);
    console.log(`  - Error Detail:     ${result.error}`);
  }

  // Check if preview artifact was created successfully and meets constraints
  const previewArtifactPath = join(plan.outputDir, 'preview_artifact.json');
  if (result.status === 'completed' && existsSync(previewArtifactPath)) {
    try {
      const previewMeta = JSON.parse(readFileSync(previewArtifactPath, 'utf8'));
      if (
        previewMeta.requiresOperatorReview === true &&
        previewMeta.readyForPublish === false &&
        previewMeta.offlinePlaceholderOnly === true
      ) {
        console.log('\n  ======================================================');
        console.log('  📢  STATUS: READY_FOR_OPERATOR_REVIEW');
        console.log('  ======================================================');
        console.log(`  Preview Artifact: ${previewArtifactPath}`);
        console.log(`  Expected Preview: ${previewMeta.expectedPreviewPath}`);
        console.log(`  Run Report:       ${join(plan.outputDir, 'run_report.md')}`);
        console.log('\n  Required Action:');
        console.log('  Operator must review/test the preview before publish.');
        console.log('\n  Safety:');
        console.log('  No Facebook publish was performed.');
        console.log('  ======================================================');
      }
    } catch (e) {}
  }

  console.log('\n  To view complete historical reports:');
  console.log('    pnpm status -- --offline');
  console.log('  ======================================================\n');

  if (result.status !== 'completed') {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal execution failure:', err);
  process.exit(1);
});
