// `script` command — Phase 3 wiring (RFC docs/RFC_SCRIPT_SAFETY_AGENT.md §3).
// Dispatcher thuần: giữ mọi pre-flight gate (exit 1/2/3/4/5/20/21) + IO artifact,
// và uỷ THÁC toàn bộ prompt/OpenAI/validate cho @vfos/ai-agents.generateSafeScript.
// DI: truyền validateScript (core) vào cổng structuralValidate (KHÔNG để package
// import ngược scripts/). Thêm exit 8 = CLAIM_SAFETY_BLOCKED + artifact
// claim_safety_report.json. Không đổi nghĩa các exit code cũ.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  buildScriptPrompt,
  generateSafeScript,
  readScriptFacts,
} from '../../../packages/ai-agents/src/index.js';
import type { SafetyReport, VisionArtifact } from '../../../packages/ai-agents/src/index.js';
import { loadDotEnv } from '../../../packages/voice/src/load-env.js';
import { isoNow, loadManifest, saveManifest } from '../core/manifest-io.js';
import { getVideoDuration } from '../core/media-probe.js';
import { JOBS_ROOT } from '../core/paths.js';
import { extractProductName } from '../core/product-card.js';
import { validateScript } from '../core/validation.js';

export async function cmdScript(args: string[]): Promise<number> {
  const parsed = parseArgs({
    args,
    options: {
      job: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'confirm-openai': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  const jobId = parsed.values.job as string | undefined;
  const dryRun = Boolean(parsed.values['dry-run']);
  const confirmOpenai = Boolean(parsed.values['confirm-openai']);

  if (!jobId) {
    console.error('Error: --job <jobId> is required');
    return 1;
  }

  const manifest = loadManifest(jobId);
  if (!manifest) {
    console.error(`🛑 UNKNOWN_JOB: ${jobId}`);
    return 2;
  }

  // Gate check (Rule 5): Block production if source is fallback/demo.
  // Canonical predicate mirrors isFallbackSource() in
  // apps/studio/src/lib/studio-data/production-gates.ts (SSOT). Scripts replicate
  // the one-liner instead of importing across the workspace boundary.
  const src = manifest.source as {
    sourceMode?: string | null;
    productionAllowed?: boolean | null;
    cleanlinessStatus?: string | null;
  };
  const sourceMode = src.sourceMode ?? null;
  const productionAllowed = src.productionAllowed ?? null;
  if (sourceMode === 'fallback' || productionAllowed === false) {
    console.error('======================================================');
    console.error(
      '🛑 PIPELINE_GATE_BLOCKED: Source is fallback/demo, not allowed for real production.',
    );
    console.error(`Job ID:             ${jobId}`);
    console.error(`sourceMode:         ${sourceMode ?? '(none)'}`);
    console.error(`productionAllowed:  ${productionAllowed === false ? 'false' : '(unset)'}`);
    console.error(
      'Fallback source is review/dev only. Attach a real approved source before production.',
    );
    console.error('======================================================');
    return 21;
  }

  // Gate check (Rule 4): Block pipeline if source cleanliness is not verified
  const cleanlinessStatus = src.cleanlinessStatus;
  if (cleanlinessStatus !== 'WATERMARK_NOT_DETECTED') {
    console.error('======================================================');
    console.error(
      '🛑 PIPELINE_GATE_BLOCKED: Source video cleanliness review is pending or failed.',
    );
    console.error(`Job ID:             ${jobId}`);
    console.error(`Cleanliness Status: ${cleanlinessStatus ?? 'UNKNOWN_NEEDS_OPERATOR_REVIEW'}`);
    console.error(
      'Operator must approve cleanliness using the following command before continuing:',
    );
    console.error(
      `  pnpm source:approve-cleanliness --job ${jobId} --status pass --notes "<operator notes>"`,
    );
    console.error('======================================================');
    return 20;
  }

  const productCardPath = resolve(manifest.source.productCardPath);
  if (!existsSync(productCardPath)) {
    console.error(`🛑 MISSING_PRODUCT_CARD: ${manifest.source.productCardPath}`);
    return 3;
  }

  let productCard: Record<string, unknown>;
  try {
    productCard = JSON.parse(readFileSync(productCardPath, 'utf8'));
  } catch (e) {
    console.error(`🛑 INVALID_PRODUCT_CARD_JSON: ${(e as Error).message}`);
    return 3;
  }

  const productName = extractProductName(productCard);
  if (!productName) {
    console.error('🛑 MISSING_PRODUCT_NAME');
    console.error('  Product card must have "name", "productName", or "title" field.');
    return 4;
  }

  // Facts (name/price) — reader di trú vào @vfos/ai-agents. priceLabel dùng
  // đúng logic cũ (>=1000 → "NK", số/chuỗi giữ nguyên, thiếu giá → null).
  const facts = readScriptFacts(productCard);
  const priceStr = facts.priceLabel;

  // Probe source video duration using ffprobe
  const sourceVideoAbs = manifest.source.sourceVideoPath
    ? resolve(manifest.source.sourceVideoPath)
    : null;

  let sourceVideoDurationSec = 30.58; // Default fallback if not found
  if (sourceVideoAbs && existsSync(sourceVideoAbs)) {
    const dur = getVideoDuration(sourceVideoAbs);
    if (dur > 0) {
      sourceVideoDurationSec = dur;
    }
  }

  // Under 8s rule
  if (sourceVideoDurationSec < 8) {
    console.error('🛑 SOURCE_VIDEO_TOO_SHORT_FOR_REVIEW');
    console.error(
      `  Source video duration (${sourceVideoDurationSec.toFixed(2)}s) is under 8 seconds.`,
    );
    return 5;
  }

  // Duration planning
  const safetyBufferSec = 1.5;
  const targetVoiceDurationSec = Math.max(5, sourceVideoDurationSec - safetyBufferSec);
  const targetWordCount = Math.floor(targetVoiceDurationSec * 2.5);

  const scriptPath = resolve(JOBS_ROOT, jobId, 'script_artifact.json');
  const claimSafetyPath = resolve(JOBS_ROOT, jobId, 'claim_safety_report.json');

  // Load Video Visual Analysis if available (Round 42)
  const visionPath = resolve(JOBS_ROOT, jobId, 'video_visual_analysis.json');
  let visionArtifact: VisionArtifact | null = null;
  if (existsSync(visionPath)) {
    try {
      visionArtifact = JSON.parse(readFileSync(visionPath, 'utf8'));
    } catch (e) {
      console.warn(`  ⚠️ Could not parse video_visual_analysis.json: ${(e as Error).message}`);
    }
  }

  console.log('======================================================');
  console.log(`📝  VFOS Job Manager — script  ${dryRun ? '🔍 DRY-RUN' : '⚡ EXECUTE'}`);
  console.log('======================================================');
  console.log(`Job ID:            ${jobId}`);
  console.log(`Product name:      ${productName}`);
  console.log(`Price:             ${priceStr ?? '(unknown)'}`);
  console.log(`Source Video:      ${manifest.source.sourceVideoPath ?? 'None'}`);
  console.log(`Video duration:    ${sourceVideoDurationSec.toFixed(2)}s`);
  console.log(`Target voice dur:  ${targetVoiceDurationSec.toFixed(2)}s`);
  console.log(`Target word count: ${targetWordCount} words`);
  console.log(`Output:            ${JOBS_ROOT}/${jobId}/script_artifact.json`);

  // Log Vision-awareness status
  if (visionArtifact) {
    console.log('Vision Context:    🟢 PRESENT (Script will be vision-grounded)');
    const analysis = visionArtifact.analysis || {};
    if (analysis.mainProductVisible === false || (analysis.productConfidence ?? 1.0) < 0.5) {
      console.log('⚠️  LOW_PRODUCT_VISIBILITY: Product visibility is low in source video!');
    }
  } else {
    console.log('Vision Context:    ⚠️ VISION_ANALYSIS_MISSING_SCRIPT_WILL_USE_PRODUCT_CARD_ONLY');
    console.log(`  Suggestion:      pnpm job:vision --job ${jobId} --confirm-openai`);
  }
  console.log('------------------------------------------------------');

  const scriptErrorPath = resolve(JOBS_ROOT, jobId, 'script_generation_error.json');
  const persistScriptError = (payload: Record<string, unknown>) => {
    try {
      mkdirSync(dirname(scriptErrorPath), { recursive: true });
      // SECURITY: never include the API key or Authorization header in this artifact.
      writeFileSync(
        scriptErrorPath,
        `${JSON.stringify({ jobId, runId: manifest.runId, generatedAt: isoNow(), ...payload }, null, 2)}\n`,
        'utf8',
      );
      console.error(
        `  ↳ Exact error persisted to ${JOBS_ROOT}/${jobId}/script_generation_error.json`,
      );
    } catch (e) {
      console.error(`  ↳ Failed to persist script error artifact: ${(e as Error).message}`);
    }
  };

  // Artifact mới (additive): báo cáo claim-safety độc lập của Đặc vụ.
  const writeSafetyReport = (report: SafetyReport) => {
    try {
      mkdirSync(dirname(claimSafetyPath), { recursive: true });
      writeFileSync(
        claimSafetyPath,
        `${JSON.stringify({ jobId, runId: manifest.runId, ...report }, null, 2)}\n`,
        'utf8',
      );
    } catch (e) {
      console.warn(`  ⚠️ Failed to write claim_safety_report.json: ${(e as Error).message}`);
    }
  };

  // Build khối artifact script v3 dùng chung cho nhánh AI và template fallback.
  const buildScriptArtifact = (opts: {
    draft: {
      shortProductName: string;
      hook: string;
      voiceoverText: string;
      captionDraft: string;
      hashtags: string[];
      estimatedSpeechDurationSec: number;
    };
    metrics: {
      duplicateHookDetected: boolean;
      repeatedProductNameCount: number;
      tooLongForVideo: boolean;
    };
    templateFallback: boolean;
  }) => {
    const { draft, metrics, templateFallback } = opts;
    return {
      scriptArtifactVersion: 'v3',
      jobId,
      runId: manifest.runId,
      productName,
      shortProductName: draft.shortProductName || productName,
      language: 'vi',
      style: 'young_fun_bold_review',
      targetDurationSec: targetVoiceDurationSec,
      estimatedSpeechDurationSec: draft.estimatedSpeechDurationSec,
      targetWordCount,
      hook: draft.hook,
      hook3s: draft.hook, // alias
      voiceover: draft.voiceoverText, // alias
      voiceoverText: draft.voiceoverText,
      captionDraft: draft.captionDraft || `${productName} #vfos #review #dealhot`,
      hashtags: draft.hashtags.length ? draft.hashtags : ['#vfos', '#review', '#dealhot'],
      visualContext: {
        used: !templateFallback && Boolean(visionArtifact),
        sourcePath:
          !templateFallback && visionArtifact
            ? `data/temp/jobs/${jobId}/video_visual_analysis.json`
            : null,
        mainProductVisible:
          !templateFallback && visionArtifact
            ? Boolean(visionArtifact.analysis?.mainProductVisible)
            : false,
        demonstratedFeaturesUsed:
          !templateFallback && visionArtifact
            ? visionArtifact.analysis?.demonstratedFeatures || []
            : [],
        scriptHintsUsed:
          !templateFallback && visionArtifact ? visionArtifact.analysis?.scriptHints || [] : [],
        mismatchWarningsConsidered:
          !templateFallback && visionArtifact
            ? visionArtifact.analysis?.mismatchWarnings || []
            : [],
        unsafeOrLowQualitySignals:
          !templateFallback && visionArtifact
            ? visionArtifact.analysis?.unsafeOrLowQualitySignals || []
            : [],
      },
      quality: {
        duplicateHookDetected: metrics.duplicateHookDetected,
        repeatedProductNameCount: metrics.repeatedProductNameCount,
        tooLongForVideo: metrics.tooLongForVideo,
        templateFallback,
        aiGenerated: !templateFallback,
        visionGrounded: !templateFallback && Boolean(visionArtifact),
      },
      // Khối claim-safety (additive) — trỏ báo cáo độc lập của Đặc vụ.
      claimSafety: {
        reportPath: `${JOBS_ROOT}/${jobId}/claim_safety_report.json`,
      },
      source: templateFallback
        ? 'job_product_card_template_fallback'
        : visionArtifact
          ? 'openai_responses_api_with_vision_context'
          : 'openai_responses_api',
      apiCalled: !templateFallback,
      generatedAt: isoNow(),
    };
  };

  if (confirmOpenai) {
    loadDotEnv();
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('🛑 MISSING_OPENAI_CREDENTIALS');
      console.error('  OPENAI_API_KEY environment variable is missing.');
      return 1;
    }

    if (dryRun) {
      const prompt = buildScriptPrompt({
        productName,
        sourceVideoDurationSec,
        targetVoiceDurationSec,
        targetWordCount,
        visionArtifact,
      });
      console.log('🔍 [Dry-Run Plan Only]');
      console.log('Would call OpenAI API (gpt-4o-mini) with prompt:');
      console.log(prompt);
      console.log('------------------------------------------------------');
      return 0;
    }

    const result = await generateSafeScript({
      facts,
      sourceVideoDurationSec,
      targetVoiceDurationSec,
      targetWordCount,
      visionArtifact,
      confirmAi: true,
      openAiApiKey: apiKey,
      structuralValidate: validateScript,
    });

    // Claim-safety backstop (exit 8, additive): không bao giờ ghi script bị chặn.
    if (result.status === 'blocked') {
      writeSafetyReport(result.safetyReport);
      persistScriptError({
        errorCode: 'CLAIM_SAFETY_BLOCKED',
        phase: 'claim_safety',
        violations: result.safetyReport.violations,
        rejectedVariants: result.rejectedVariants,
        model: 'gpt-4o-mini',
      });
      console.error('🛑 CLAIM_SAFETY_BLOCKED');
      console.error('  Generated script contains hard-blocked claims and cannot be used.');
      for (const v of result.safetyReport.violations) {
        console.error(`  - [${v.ruleId}] "${v.matched}" (${v.category})`);
      }
      return 8;
    }

    // AI hết lượt → giữ nguyên nghĩa exit cũ: 6 (API failure) vs 7 (validation).
    if (result.status === 'fallback') {
      const sawCompletion = result.rejectedVariants.some((v) => v.reason !== 'API_ERROR');
      persistScriptError({
        errorCode: sawCompletion ? 'SCRIPT_QUALITY_VALIDATION_FAILED' : 'OPENAI_API_FAILURE',
        phase: sawCompletion ? 'validation' : 'openai',
        rejectedVariants: result.rejectedVariants,
        model: 'gpt-4o-mini',
      });
      if (sawCompletion) {
        console.error('🛑 SCRIPT_QUALITY_VALIDATION_FAILED');
        console.error('Generated script failed all generation attempts.');
        return 7;
      }
      console.error('🛑 OPENAI_API_FAILURE');
      return 6;
    }

    // status === 'ok'
    const draft = result.draft;
    if (!draft) {
      console.error('🛑 OPENAI_API_FAILURE');
      return 6;
    }
    console.log('🟢 AI script successfully generated and validation PASSED.');

    // Re-run structural validate (hàm thuần, không gọi API) để lấy metrics artifact.
    const validation = validateScript({
      voiceoverText: draft.voiceoverText,
      hook: draft.hook,
      productName,
      targetDurationSec: targetVoiceDurationSec,
      estimatedSpeechDurationSec: draft.estimatedSpeechDurationSec,
      visionAnalysis: visionArtifact,
    });

    // Clear any stale error artifact from a previous failed run.
    try {
      if (existsSync(scriptErrorPath)) rmSync(scriptErrorPath);
    } catch {
      /* best-effort cleanup */
    }

    writeSafetyReport(result.safetyReport);

    const scriptArtifact = buildScriptArtifact({
      draft,
      metrics: {
        duplicateHookDetected: validation.metrics.duplicateHookDetected,
        repeatedProductNameCount: validation.metrics.repeatedProductNameCount,
        tooLongForVideo: validation.metrics.tooLongForVideo,
      },
      templateFallback: false,
    });

    mkdirSync(dirname(scriptPath), { recursive: true });
    writeFileSync(scriptPath, `${JSON.stringify(scriptArtifact, null, 2)}\n`, 'utf8');

    manifest.artifacts.scriptArtifactPath = `${JOBS_ROOT}/${jobId}/script_artifact.json`;
    saveManifest(manifest);

    console.log('✅ Script artifact written.');
    return 0;
  }

  // Safe mode fallback template (confirmAi=false)
  if (existsSync(scriptPath)) {
    console.log('ℹ️  Script artifact already exists in job folder:');
    try {
      const existing = JSON.parse(readFileSync(scriptPath, 'utf8'));
      console.log(`  Source:     ${existing.source}`);
      console.log(`  Hook:       ${existing.hook}`);
      console.log(`  Voiceover:  ${existing.voiceoverText?.slice(0, 100)}...`);
      console.log(`  AI Gen:     ${existing.quality?.aiGenerated ? 'Yes' : 'No'}`);
    } catch (err) {
      console.warn(`  (Could not parse existing script artifact: ${(err as Error).message})`);
    }
    return 0;
  }

  console.log('⚠️  [Safe ModeFallback] TEMPLATE_FALLBACK_NOT_FINAL');
  console.log('OpenAI API confirm flag missing. Writing default template fallback script...');

  const result = await generateSafeScript({
    facts,
    sourceVideoDurationSec,
    targetVoiceDurationSec,
    targetWordCount,
    visionArtifact,
    confirmAi: false,
    structuralValidate: validateScript,
  });

  // Claim-safety backstop cũng áp cho template (exit 8) — phòng template bị sửa bẩn.
  if (result.status === 'blocked') {
    console.error('🛑 CLAIM_SAFETY_BLOCKED');
    console.error('  Template fallback script contains hard-blocked claims and cannot be used.');
    for (const v of result.safetyReport.violations) {
      console.error(`  - [${v.ruleId}] "${v.matched}" (${v.category})`);
    }
    return 8;
  }

  const draft = result.draft;
  if (!draft) {
    console.error('🛑 CLAIM_SAFETY_BLOCKED');
    return 8;
  }

  if (dryRun) {
    console.log('Dry-run: no file written, no manifest mutation.');
    return 0;
  }

  writeSafetyReport(result.safetyReport);

  const scriptArtifact = buildScriptArtifact({
    draft,
    metrics: { duplicateHookDetected: false, repeatedProductNameCount: 1, tooLongForVideo: false },
    templateFallback: true,
  });

  mkdirSync(dirname(scriptPath), { recursive: true });
  writeFileSync(scriptPath, `${JSON.stringify(scriptArtifact, null, 2)}\n`, 'utf8');

  manifest.artifacts.scriptArtifactPath = `${JOBS_ROOT}/${jobId}/script_artifact.json`;
  saveManifest(manifest);

  console.log('✅ Default template fallback script written.');
  console.log('------------------------------------------------------');
  return 0;
}
