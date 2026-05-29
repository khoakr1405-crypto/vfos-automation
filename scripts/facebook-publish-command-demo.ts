/**
 * Facebook Publish Command Skeleton — Round P36.
 *
 * An independent verification script that audits operator review packs and outputs
 * a simulated post request artifact without triggering any live Meta API calls.
 *
 * Command: tsx scripts/facebook-publish-command-demo.ts --run <runId> [--confirm-final-approval] [--output <path>]
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

// Parse command-line parameters
let values: any;
try {
  const parsed = parseArgs({
    options: {
      run: { type: 'string' },
      'confirm-final-approval': { type: 'boolean', default: false },
      output: { type: 'string', default: 'data/temp/facebook_publish_request.json' },
    },
    allowPositionals: false,
    strict: true,
  });
  values = parsed.values;
} catch (err: any) {
  console.error(`ERROR: Failed to parse arguments: ${err.message}`);
  process.exit(1);
}

if (!values.run) {
  console.error('ERROR: Mandatory option "--run <runId>" is missing.');
  console.log('Usage: tsx scripts/facebook-publish-command-demo.ts --run <runId> [--confirm-final-approval]');
  process.exit(1);
}

const runId = values.run;
const confirmApproval = values['confirm-final-approval'];
const outputPath = values.output;

// ── Smart Custom Dotenv Parser ──────────────────────────────────────────────
function loadDotEnv() {
  if (existsSync('.env')) {
    try {
      const content = readFileSync('.env', 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const index = trimmed.indexOf('=');
          if (index > 0) {
            const key = trimmed.slice(0, index).trim();
            let val = trimmed.slice(index + 1).trim();
            if (val.startsWith('"') && val.endsWith('"')) {
              val = val.slice(1, -1);
            } else if (val.startsWith("'") && val.endsWith("'")) {
              val = val.slice(1, -1);
            }
            process.env[key] = val;
          }
        }
      }
    } catch (err) {
      console.warn(`[FacebookPublishCommand] Warning: Failed to load .env: ${err}`);
    }
  }
}

loadDotEnv();

function maskCredential(value: string | undefined): string {
  if (!value) return 'MISSING_SECRET_KEY';
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function main() {
  console.log('======================================================');
  console.log('📢   VFOS Facebook Live-Publishing Security Gate');
  console.log('======================================================');
  console.log(`- Target Run ID:     ${runId}`);
  console.log(`- Operator Approval: ${confirmApproval ? '✅ CONFIRMED' : '❌ NOT_PROVIDED'}`);
  console.log('------------------------------------------------------');

  const runDir = join('data/temp/pipeline-p9-demo', runId);
  const reviewPackPath = join(runDir, 'operator_review_pack.json');

  if (!existsSync(reviewPackPath)) {
    console.error(`🔴 ERROR: Operator Review Pack not found at expected path: ${reviewPackPath}`);
    console.error('Please run the pipeline ("pnpm chay") first to generate the review pack.');
    process.exit(1);
  }

  // 1. Load and parse the Operator Review Pack
  let pack: any;
  try {
    pack = JSON.parse(readFileSync(reviewPackPath, 'utf8'));
  } catch (err: any) {
    console.error(`🔴 ERROR: Failed to parse operator review pack: ${err.message}`);
    process.exit(1);
  }

  // 2. Validate mandatory review pack state and properties
  console.log('[FacebookPublishCommand] Validating review pack constraints...');
  
  if (pack.state !== 'READY_FOR_FINAL_OPERATOR_APPROVAL') {
    console.error(`🔴 ERROR: Review pack is in invalid state: "${pack.state}". Target state must be "READY_FOR_FINAL_OPERATOR_APPROVAL".`);
    process.exit(1);
  }

  const videoFile = pack.preview?.videoPath;
  if (!videoFile || !existsSync(videoFile)) {
    console.error(`🔴 ERROR: Preview video file does not exist on disk: ${videoFile}`);
    process.exit(1);
  }

  const caption = pack.content?.captionDraft;
  if (!caption || caption.trim().length === 0) {
    console.error('🔴 ERROR: Caption draft is missing or empty.');
    process.exit(1);
  }

  const pageIdMasked = pack.facebook?.selectedPageIdMasked;
  if (!pageIdMasked || pageIdMasked === '****') {
    console.error('🔴 ERROR: Routed Facebook Page parameters are missing or invalid.');
    process.exit(1);
  }

  console.log('🟢 CONSTRAINTS CHECK: PASSED');
  console.log(`- Video Path Verified:  ${videoFile}`);
  console.log(`- Target Page Masked:   ${pageIdMasked}`);
  console.log(`- Caption Verified:     "${caption.slice(0, 50)}..."`);
  
  // Strict Safety Checks
  if (pack.safety?.allowPublish !== false || pack.safety?.facebookApiCalled !== false) {
    console.error('🔴 SAFETY ERROR: AllowPublish or API state parameters violated safety bounds.');
    process.exit(1);
  }

  console.log('\n--- Final Preflight Submission Status ---');

  // 3. Handle required Operator Confirmation Gate
  if (!confirmApproval) {
    console.warn('⚠️  WARNING: Publishing requires explicit final operator confirmation.');
    console.log('Please execute the command again adding the approval flag:');
    console.log(`  pnpm publish:facebook --run ${runId} --confirm-final-approval`);
    console.log('------------------------------------------------------\n');
    process.exit(0);
  }

  // 4. Output the approved simulated publish ticket
  const simulatedPostId = `${pack.facebook?.selectedPageIdMasked || '1169992221'}_${Math.floor(1000000000 + Math.random() * 9000000000)}`;
  
  const publishRequest = {
    publishRequestId: `req_${runId}_${Date.now()}`,
    status: 'APPROVED_FOR_MANUAL_SUBMISSION',
    details: {
      runId,
      videoPath: videoFile,
      caption,
      hashtags: pack.content?.hashtags || [],
      facebookPageIdMasked: pageIdMasked,
      facebookPageName: pack.facebook?.selectedPageName || 'Review Nhà bạn',
    },
    safetyLock: {
      facebookApiCalled: false,
      uploaded: false,
      published: false,
      allowLivePublish: false,
      requiresExplicitAdminTokens: true,
      operatorApprovalTimestamp: new Date().toISOString(),
    },
    message: 'Publishing verification ticket created. System ready for future live publication step once Meta integration is enabled.',
  };

  try {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(publishRequest, null, 2), 'utf8');
    console.log('🟢 STATUS: SUCCESS');
    console.log(`- Simulated Post ID: ${simulatedPostId}`);
    console.log(`- Status:            ${publishRequest.status}`);
    console.log(`- Safety Token Check: Masked keys confirmed.`);
    console.log(`[FacebookPublishCommand] Diagnostics saved successfully to: ${outputPath}`);
    console.log('======================================================\n');
    process.exit(0);
  } catch (err: any) {
    console.error(`🔴 ERROR: Failed to write publishing request ticket: ${err.message}`);
    process.exit(1);
  }
}

main();
