/**
 * VFOS Orchestrator CLI — One-Command Operator Executable — Round P21.
 *
 * Provides a short command entrypoint to trigger standard local-preview composition,
 * plan dry-runs, and custom run execution modes.
 *
 * Commands:
 *   pnpm chay                 --> Runs pipeline with --mode local-preview
 *   pnpm chay --dry / --plan  --> Runs pipeline with dry-run and print-plan
 *   pnpm chay --mode <mode>   --> Runs pipeline in custom override mode
 */

import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const options = {
  dry: { type: 'boolean' as const },
  plan: { type: 'boolean' as const },
  mode: { type: 'string' as const },
};

const { values } = parseArgs({ options, strict: false, allowPositionals: true });

function main() {
  const isDryRun = values.dry || values.plan || false;
  const targetMode = values.mode || 'local-preview';

  console.log('======================================================');
  console.log('🚀   VFOS Operator Unified CLI Wrapper ("pnpm chay")');
  console.log('======================================================');
  console.log(`- Action Mode: ${isDryRun ? '🔍 DRY-RUN PLAN ONLY' : '⚡ RUN PIPELINE'}`);
  console.log(`- Target Mode: "${targetMode}"`);
  console.log('------------------------------------------------------\n');

  const manifestPath = 'apps/kernel/config/manifests/review_product_run_manifest.json';

  const runArgs = [
    'scripts/pipeline-run-manifest.ts',
    '--manifest',
    manifestPath,
    '--mode',
    targetMode,
  ];

  if (isDryRun) {
    runArgs.push('--dry-run', '--print-plan');
  }

  // Spawn tsx directly for robust, cross-platform execution
  const result = spawnSync('npx', ['tsx', ...runArgs], {
    stdio: 'inherit',
    shell: true,
  });

  process.exit(result.status ?? 0);
}

main();
