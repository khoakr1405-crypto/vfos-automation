import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function runGit(cmd: string): string {
  try {
    return execSync(cmd, { stdio: 'pipe', encoding: 'utf8' }).trim();
  } catch (err: any) {
    throw new Error(`Failed to execute Git command: "${cmd}". Error: ${err.message}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const refreshRemoteUsed = args.includes('--refresh-remote');
  const confirmPush = args.includes('--confirm-push');
  const confirmPull = args.includes('--confirm-pull');
  const ackUntrackedLocal = args.includes('--ack-untracked-local');

  let requestedAction: 'none' | 'push' | 'pull' = 'none';
  if (confirmPush) requestedAction = 'push';
  else if (confirmPull) requestedAction = 'pull';

  console.log('======================================================');
  console.log('🧭  VFOS GIT SYNC GUARD');
  if (requestedAction !== 'none') {
    console.log(`Action requested:  ${requestedAction.toUpperCase()}`);
  } else {
    console.log('Mode:              read-only');
  }
  console.log('======================================================');

  if (refreshRemoteUsed) {
    console.log('[GitGuard] Refreshing remote diagnostics (git fetch origin)...');
    try {
      execSync('git fetch origin', { stdio: 'ignore' });
      console.log('[GitGuard] Remote refreshed successfully.');
    } catch (err: any) {
      console.warn(
        `[GitGuard] WARNING: Failed to fetch remote (network issue or origin not found): ${err.message}`,
      );
    }
  }

  // 1. QUERY GIT STATE
  let branch = 'unknown';
  let isExpectedBranch = false;
  let repoRoot = '';
  try {
    branch = runGit('git rev-parse --abbrev-ref HEAD');
    isExpectedBranch = branch === 'master';
    repoRoot = runGit('git rev-parse --show-toplevel');
  } catch (err: any) {
    console.error(`[GitGuard] FATAL: Not inside a valid git repository: ${err.message}`);
    process.exit(1);
  }

  let ahead = 0;
  let behind = 0;
  let isUpToDate = true;
  try {
    // Left-right count of origin/master...HEAD
    const countStr = runGit('git rev-list --left-right --count origin/master...HEAD');
    const [behindStr, aheadStr] = countStr.split(/\s+/);
    behind = Number.parseInt(behindStr, 10) || 0;
    ahead = Number.parseInt(aheadStr, 10) || 0;
    isUpToDate = ahead === 0 && behind === 0;
  } catch (err: any) {
    // If origin/master is missing/unfetched
    isUpToDate = false;
  }

  // 2. DETECT WORKING TREE AND STAGED RISKS
  let statusLines: string[] = [];
  try {
    const statusOutput = runGit('git status --porcelain');
    if (statusOutput) {
      statusLines = statusOutput
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    }
  } catch {}

  const clean = statusLines.length === 0;
  let modifiedCount = 0;
  let stagedCount = 0;
  let untrackedCount = 0;
  let sensitiveRiskCount = 0;
  let runtimeRiskCount = 0;
  const risks: string[] = [];

  const sensitiveRiskKeywords = [
    '.env',
    '.env.local',
    '.env.production',
    'cookie',
    'cookies',
    'session',
    'token',
    'secret',
    'credential',
    'storage_state',
    'browser-data',
    'debug-html',
  ];

  const runtimeMediaExtensions = ['.mp4', '.mp3', '.wav', '.m4a', '.mov', '.webm'];

  const runtimeFileKeywords = [
    'operator_review_pack.json',
    'operator_review_pack.md',
    'vfos_daily_status.json',
    'vfos_daily_runbook.md',
    'vfos_operator_checkpoint.json',
    'vfos_operator_checkpoint.md',
    'vfos_git_sync_status.json',
  ];

  for (const line of statusLines) {
    if (line.length < 3) continue;
    const indexStatus = line[0];
    const workTreeStatus = line[1];
    const filePath = line.substring(3).trim();

    const isStaged = indexStatus !== ' ' && indexStatus !== '?';
    const isUntracked = indexStatus === '?' && workTreeStatus === '?';

    if (isStaged) {
      stagedCount++;
    } else if (isUntracked) {
      untrackedCount++;
    } else {
      modifiedCount++;
    }

    // Check sensitive risk (in staged, modified or untracked)
    const lowerPath = filePath.toLowerCase();
    const matchesSensitive = sensitiveRiskKeywords.some((kw) => lowerPath.includes(kw));
    if (matchesSensitive) {
      sensitiveRiskCount++;
      risks.push(
        `SENSITIVE RISK: File containing potential secrets found: "${filePath}" (Staged: ${isStaged})`,
      );
    }

    // Check runtime staged risk (specifically staged only)
    if (isStaged) {
      const matchesRuntimeKeyword =
        runtimeFileKeywords.some((kw) => lowerPath.includes(kw)) ||
        lowerPath.includes('data/temp/') ||
        lowerPath.includes('production/fixtures/');
      const matchesMediaExtension = runtimeMediaExtensions.some((ext) => lowerPath.endsWith(ext));

      if (matchesRuntimeKeyword || matchesMediaExtension) {
        runtimeRiskCount++;
        risks.push(`RUNTIME STAGED RISK: Generated artifact/media staged: "${filePath}"`);
      }
    }
  }

  // 3. RECOMMENDATION ACTION LOGIC
  let status: 'PASS' | 'WARN' | 'DIVERGED' | 'DIRTY' | 'BLOCKED' = 'PASS';
  let recommendedAction = 'Repo is clean and synced. Safe to continue.';

  if (!isExpectedBranch) {
    status = 'WARN';
    recommendedAction = `Switch/check branch before continuing. Currently on branch: "${branch}" instead of "master".`;
  } else if (sensitiveRiskCount > 0) {
    status = 'BLOCKED';
    recommendedAction = 'Unstage/remove sensitive files immediately. Do not commit credentials!';
  } else if (runtimeRiskCount > 0) {
    status = 'BLOCKED';
    recommendedAction = 'Unstage runtime/media artifacts. Do not commit generated files.';
  } else if (ahead > 0 && behind > 0) {
    status = 'DIVERGED';
    recommendedAction =
      'Stop and resolve Git divergence manually (local and remote have both diverged).';
  } else if (ahead > 0) {
    status = 'WARN';
    recommendedAction = `Push local commits before switching machines. (Ahead: ${ahead})`;
  } else if (behind > 0) {
    status = 'WARN';
    recommendedAction = `Pull latest changes before continuing. (Behind: ${behind})`;
  } else if (!clean) {
    status = 'DIRTY';
    recommendedAction = 'Review changes before continuing. Commit/stash/restore intentionally.';
  }

  // 4. SUPERVISED ACTION HOOKS EXECUTION
  let executed = false;
  let actionResult: 'NONE' | 'SUCCESS' | 'FAILED' | 'BLOCKED' | 'REQUIRE_ACK' = 'NONE';
  let blockedReason: string | null = null;
  let commandRun: string | null = null;
  let requiresAckUntrackedLocal = false;
  const actionWarnings: string[] = [];

  let ranGitPush = false;
  let ranGitPull = false;

  if (requestedAction === 'push') {
    if (!isExpectedBranch) {
      actionResult = 'BLOCKED';
      blockedReason = `Push blocked: Must be on branch "master", current branch: "${branch}"`;
    } else if (ahead === 0) {
      actionResult = 'BLOCKED';
      blockedReason = 'Push blocked: No ahead commits to push.';
    } else if (behind > 0) {
      actionResult = 'BLOCKED';
      blockedReason = 'Push blocked: Remote has behind commits. Diverged history needs pull/merge.';
    } else if (sensitiveRiskCount > 0) {
      actionResult = 'BLOCKED';
      blockedReason = 'Push blocked: Staged sensitive risks detected.';
    } else if (runtimeRiskCount > 0) {
      actionResult = 'BLOCKED';
      blockedReason = 'Push blocked: Staged runtime/media risks detected.';
    } else if (modifiedCount > 0) {
      actionResult = 'BLOCKED';
      blockedReason = 'Push blocked: Tracked modified files exist. Please commit or stash first.';
    } else if (untrackedCount > 0 && !ackUntrackedLocal) {
      actionResult = 'REQUIRE_ACK';
      requiresAckUntrackedLocal = true;
      blockedReason =
        'Untracked local files detected. These files will NOT be pushed to GitHub. Run again with --ack-untracked-local to acknowledge.';
    } else {
      if (untrackedCount > 0) {
        actionWarnings.push('Untracked local files are present and will NOT be pushed.');
      }
      console.log('\n🚀 Executing push command: git push origin master');
      commandRun = 'git push origin master';
      try {
        execSync('git push origin master', { stdio: 'inherit' });
        actionResult = 'SUCCESS';
        executed = true;
        ranGitPush = true;
        // Refresh git counts
        ahead = 0;
        isUpToDate = behind === 0;
      } catch (err: any) {
        actionResult = 'FAILED';
        executed = true;
        blockedReason = `Git push command failed: ${err.message}`;
      }
    }
  } else if (requestedAction === 'pull') {
    if (!isExpectedBranch) {
      actionResult = 'BLOCKED';
      blockedReason = `Pull blocked: Must be on branch "master", current branch: "${branch}"`;
    } else if (behind === 0) {
      actionResult = 'BLOCKED';
      blockedReason = 'Pull blocked: No behind commits to pull.';
    } else if (ahead > 0) {
      actionResult = 'BLOCKED';
      blockedReason = 'Pull blocked: Local ahead commits exist. Pulling might cause conflicts.';
    } else if (modifiedCount > 0) {
      actionResult = 'BLOCKED';
      blockedReason =
        'Pull blocked: Working tree has modified tracked files. Pull is blocked to avoid overwriting local work.';
    } else if (stagedCount > 0) {
      actionResult = 'BLOCKED';
      blockedReason = 'Pull blocked: Staged files exist. Commit or reset before pulling.';
    } else if (untrackedCount > 0 && !ackUntrackedLocal) {
      actionResult = 'REQUIRE_ACK';
      requiresAckUntrackedLocal = true;
      blockedReason =
        'Untracked local files detected. Pulling might overwrite or conflict with untracked files. Run again with --ack-untracked-local to acknowledge.';
    } else {
      if (untrackedCount > 0) {
        actionWarnings.push('Untracked local files present during pull.');
      }
      console.log('\n📥 Executing fast-forward pull command: git pull --ff-only origin master');
      commandRun = 'git pull --ff-only origin master';
      try {
        execSync('git pull --ff-only origin master', { stdio: 'inherit' });
        actionResult = 'SUCCESS';
        executed = true;
        ranGitPull = true;
        // Refresh git counts
        behind = 0;
        isUpToDate = ahead === 0;
      } catch (err: any) {
        actionResult = 'FAILED';
        executed = true;
        blockedReason = `Git fast-forward pull failed: ${err.message}`;
      }
    }
  }

  // 5. PRINT CLI OUTPUT
  console.log(`\nBranch:            ${branch}`);
  console.log('Expected branch:   master');
  console.log(`Ahead origin:      ${ahead}`);
  console.log(`Behind origin:     ${behind}`);
  console.log(`Working tree:      ${clean ? 'CLEAN 🟢' : 'DIRTY 🟡'}`);

  console.log('\nRuntime/Sensitive Risk:');
  console.log(`- Staged Sensitive: ${sensitiveRiskCount > 0 ? 'FAIL 🔴' : 'PASS 🟢'}`);
  console.log(`- Staged Runtime:   ${runtimeRiskCount > 0 ? 'FAIL 🔴' : 'PASS 🟢'}`);

  if (risks.length > 0) {
    console.log('\n⚠️  DETECTED RISK WARNINGS:');
    for (const r of risks) {
      console.log(`  * ${r}`);
    }
  }

  if (requestedAction !== 'none') {
    console.log(`\nAction Execution Result: [${actionResult}]`);
    if (blockedReason) {
      console.log(`Reason:            ${blockedReason}`);
    }
    if (commandRun) {
      console.log(`Command run:       ${commandRun}`);
    }
    if (actionWarnings.length > 0) {
      console.log('Warnings:');
      for (const w of actionWarnings) {
        console.log(`  - ${w}`);
      }
    }
  }

  console.log('\n💡 RECOMMENDED ACTION:');
  if (actionResult === 'REQUIRE_ACK' && requestedAction === 'push') {
    console.log('Untracked local files detected.');
    console.log('These files will NOT be pushed to GitHub.');
    console.log('Run again with:');
    console.log('pnpm vfos:sync-check --confirm-push --ack-untracked-local');
    console.log('only if you understand these files remain local to this machine.');
  } else if (actionResult === 'REQUIRE_ACK' && requestedAction === 'pull') {
    console.log('Untracked local files detected.');
    console.log('Pulling might overwrite or conflict with untracked files.');
    console.log('Run again with:');
    console.log('pnpm vfos:sync-check --confirm-pull --ack-untracked-local');
  } else {
    console.log(recommendedAction);
  }

  console.log('\n🧭 HANDOVER REMINDER:');
  console.log('- Before leaving this machine: commit/push intended code changes.');
  console.log('- On another machine:          git pull before continuing.');
  console.log('- Do not assume data/temp exists across machines.');
  console.log('======================================================\n');

  // 6. EXPORT STATUS ARTIFACT
  const syncStatusPath = 'data/temp/vfos_git_sync_status.json';
  const syncStatusJson = {
    syncCheckVersion: 'v1',
    generatedAt: new Date().toISOString(),
    status,
    repo: {
      root: repoRoot,
      branch,
      expectedBranch: 'master',
      isExpectedBranch,
    },
    remote: {
      name: 'origin',
      branch: 'origin/master',
      refreshRemoteUsed,
    },
    sync: {
      ahead,
      behind,
      isUpToDate,
      needsPush: ahead > 0,
      needsPull: behind > 0,
    },
    workingTree: {
      clean,
      modifiedCount,
      stagedCount,
      untrackedCount,
      sensitiveRiskCount,
      runtimeRiskCount,
    },
    risks,
    recommendedAction,
    action: {
      requested: requestedAction,
      executed,
      result: actionResult,
      blockedReason,
      command: commandRun,
      requiresAckUntrackedLocal,
      warnings: actionWarnings,
    },
    postActionSync: {
      ahead,
      behind,
      isUpToDate,
    },
    handover: {
      leavingThisMachine: 'If you made code changes, commit and push before switching machines.',
      startingOnNewMachine:
        'Run git pull before continuing. Do not assume data/temp artifacts exist.',
    },
    safety: {
      readOnlyCheck: requestedAction === 'none',
      ranGitCommit: false,
      ranGitPush,
      ranGitPull,
      stagedFiles: false,
      readEnv: false,
      loggedSecrets: false,
    },
  };

  try {
    mkdirSync(dirname(syncStatusPath), { recursive: true });
    writeFileSync(syncStatusPath, JSON.stringify(syncStatusJson, null, 2), 'utf8');
  } catch (err: any) {
    console.error(`[GitGuard] Failed to write status file: ${err.message}`);
  }
}

main();
