/**
 * Offline Human/Operator Approval Gate Helper Script — Round P16.
 *
 * Simulates check for render output and operator review prior to publication simulation.
 *
 * Command: tsx scripts/offline-approval-gate-demo.ts --render <path> --output <path> [--mode <mode>] [--approve] [--reject]
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';

const options = {
  render: { type: 'string' as const },
  output: { type: 'string' as const },
  mode: { type: 'string' as const },
  approve: { type: 'boolean' as const },
  reject: { type: 'boolean' as const },
};

const { values } = parseArgs({ options, strict: false });

function main() {
  const renderPath = values.render;
  const outputPath = values.output;
  const mode = values.mode || 'pass';
  const forceApprove = values.approve || false;
  const forceReject = values.reject || false;

  if (!renderPath || !outputPath) {
    console.error('ERROR: Missing required options: --render, --output are required.');
    process.exit(1);
  }

  console.log(`[OfflineApprovalGate] Initiating step. Mode: "${mode}"`);

  // Handle reject mode directly
  if (mode === 'approval-reject' || forceReject) {
    console.error('ERROR: Approval Gate Rejected: Content failed operator quality check.');
    process.exit(1);
  }

  // Handle pending mode directly
  if (mode === 'approval-pending') {
    console.error('ERROR: Approval pending: Operator review required before publishing.');
    process.exit(1);
  }

  // If a preceding step's fail mode was bypassed/invoked here
  if (['product-fail', 'visual-fail', 'script-fail', 'voice-fail', 'render-fail'].includes(mode)) {
    console.error(`ERROR: Preceding failure condition detected: mode "${mode}". Halting approval.`);
    process.exit(1);
  }

  // Verify render manifest exists
  if (!existsSync(renderPath)) {
    console.error(`ERROR: Render manifest not found at: ${renderPath}`);
    process.exit(1);
  }

  // Parse file to verify valid JSON
  let renderMeta: any;
  try {
    renderMeta = JSON.parse(readFileSync(renderPath, 'utf8'));
  } catch (err: any) {
    console.error(`ERROR: Failed to parse render manifest JSON: ${err.message}`);
    process.exit(1);
  }

  // Formulate the approval artifact
  const approvalArtifact = {
    approvalId: 'approval_run_review_product_p9',
    status: 'approved',
    approvedBy: 'operator',
    approvedAt: new Date().toISOString(),
    renderManifestPath: renderPath,
    notes: 'Offline approval gate passed. Safe to continue to publish simulation.',
    offlineMode: mode,
  };

  try {
    writeFileSync(outputPath, JSON.stringify(approvalArtifact, null, 2), 'utf8');
    console.log(`[OfflineApprovalGate] Successfully approved and compiled artifact: ${outputPath}`);
    process.exit(0);
  } catch (err: any) {
    console.error(`ERROR: Failed to write approval artifact to ${outputPath}: ${err.message}`);
    process.exit(1);
  }
}

main();
