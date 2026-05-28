/**
 * CLI Demo — Verify Step Runner + Artifact Gate operation.
 *
 * Simulates a safe, isolated dry-run pipeline step using a tiny
 * Node script that writes a temporary file. Then, calls the
 * Artifact Gate to validate the output.
 */

import { StepRunner } from '../apps/kernel/src/pipeline/step-runner.js';
import { ArtifactGate } from '../apps/kernel/src/pipeline/artifact-gate.js';
import type { StepDefinition } from '../apps/kernel/src/pipeline/step-registry.js';

// Setup basic console logger matching existing format
const logger = {
  info: (obj: any, msg: string) => console.log(`[INFO] ${msg}`, JSON.stringify(obj)),
  debug: (obj: any, msg: string) => console.log(`[DEBUG] ${msg}`, JSON.stringify(obj)),
  warn: (obj: any, msg: string) => console.warn(`[WARN] ${msg}`, JSON.stringify(obj)),
  error: (obj: any, msg: string) => console.error(`[ERROR] ${msg}`, JSON.stringify(obj)),
} as any;

async function main() {
  console.log('\n  ======================================================');
  console.log('  🏁   VFOS P1 Step Runner & Artifact Gate Demo        ');
  console.log('  ======================================================\n');

  const runner = new StepRunner(logger);
  const gate = new ArtifactGate(logger, '.');

  // 1. Define a secure, cross-platform dry-run step that writes a test file
  const testStep: StepDefinition = {
    stepName: 'demo:write-test-file',
    command: 'node',
    args: [
      '-e',
      `"const fs = require('fs'); fs.mkdirSync(require('path').join('data', 'temp'), { recursive: true }); fs.writeFileSync(require('path').join('data', 'temp', 'demo-artifact.json'), JSON.stringify({ ok: true, source: 'P1 demo' })); console.log('Demo file successfully written!');"`,
    ],
    cwd: '.',
    timeoutMs: 10_000,
    expectedArtifacts: ['data/temp/demo-artifact.json'],
    description: 'Dry-run: write a temporary artifact JSON for P1 validation.',
  };

  // 2. Execute the child process via Step Runner
  console.log('  [1/3] Spawning dry-run child process...');
  const outcome = await runner.run(testStep);

  console.log('\n  Outcome Report:');
  console.log(`  - Status:      ${outcome.status === 'success' ? '✅ success' : '❌ ' + outcome.status}`);
  console.log(`  - Exit Code:   ${outcome.exitCode}`);
  console.log(`  - Duration:    ${outcome.durationMs}ms`);
  console.log(`  - stdout:      ${outcome.stdout.trim()}`);
  if (outcome.stderr) console.log(`  - stderr:      ${outcome.stderr.trim()}`);

  if (outcome.status !== 'success') {
    console.error('\n  ❌ Dry-run step failed to run. Exiting.');
    process.exit(1);
  }

  // 3. Verify output files via Artifact Gate
  console.log('\n  [2/3] Checking expected output files...');
  const gateReport = gate.validate(testStep.expectedArtifacts);

  console.log('\n  Gate Report:');
  console.log(`  - Passed:      ${gateReport.passed ? '✅ YES' : '❌ NO'}`);
  for (const val of gateReport.validations) {
    console.log(`  - File:        ${val.path}`);
    console.log(`    Exists:      ${val.exists}`);
    console.log(`    Size:        ${val.sizeBytes} bytes`);
    console.log(`    Valid:       ${val.valid}`);
    if (val.reason) console.log(`    Reason:      ${val.reason}`);
  }

  // 4. Summarize demo result
  console.log('\n  [3/3] Demo Summary:');
  if (outcome.status === 'success' && gateReport.passed) {
    console.log('  ======================================================');
    console.log('  🎉   Step Runner and Artifact Gate work successfully!   ');
    console.log('  ======================================================\n');
  } else {
    console.log('  ❌ Validation failed.');
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
