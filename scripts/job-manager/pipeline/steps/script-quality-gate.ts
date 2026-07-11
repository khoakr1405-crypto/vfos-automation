// H8 — SCRIPT QUALITY + FRESHNESS GATE (verbatim move từ review-video-orchestrator
// dòng 388–560 [validateScript] + 1050–1213). Thứ tự guard GIỮ NGUYÊN:
// templateFallback warn → vision-grounded warn → DUPLICATE_OPENING_HOOK (exit 24)
// → validateScript (exit 11) → freshness voice (exit 12) → freshness timing (exit 13)
// → outer parse fail (exit 12).
// LƯU Ý: validateScript ở đây là bản CÓ Vision Grounding (Round 42) — near-dup với
// core/validation.ts (bản structural cho job:script). KHÔNG hợp nhất ở round anatomy
// này để không đổi behavior 2 call site; để private tại đây.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  calculateNormalizedHash,
  detectOpeningRepetition,
  extractCombinedVoiceText,
} from '../../../job-artifact-freshness.js';
import { saveManifest } from '../../core/manifest-io.js';
import { getVideoDuration } from '../../core/media-probe.js';
import { updateRegistryFromManifest } from '../../core/registry-io.js';
import type { PipelineContext } from '../context.js';
import { writeStatusArtifact } from '../status-artifact.js';

interface VisionAnalysisArtifact {
  analysis?: {
    mainProductVisible?: boolean;
    productConfidence?: number;
    mismatchWarnings?: string[];
    demonstratedFeatures?: string[];
  };
}

interface ScriptArtifactData {
  voiceoverText?: string;
  hook?: string;
  hook3s?: string;
  productName?: string;
  targetDurationSec?: number;
  estimatedSpeechDurationSec?: number;
  quality?: { templateFallback?: boolean };
  visualContext?: { used?: boolean };
}

interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  metrics: {
    duplicateHookDetected: boolean;
    repeatedProductNameCount: number;
    tooLongForVideo: boolean;
    ngramRepetitionDetected: boolean;
    visionGrounded?: boolean;
  };
}

function validateScript(args: {
  voiceoverText: string;
  hook: string;
  productName: string;
  targetDurationSec: number;
  estimatedSpeechDurationSec: number;
  visionAnalysis?: VisionAnalysisArtifact | null;
}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const text = args.voiceoverText.trim();
  const textLower = text.toLowerCase();
  const hookLower = args.hook.trim().toLowerCase();
  const prodLower = args.productName.trim().toLowerCase();

  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  let duplicateHookDetected = false;
  let tooLongForVideo = false;
  let ngramRepetitionDetected = false;
  let visionGrounded = false;

  // 1. Duplicate hook validator:
  let hookOccurrences = 0;
  if (hookLower) {
    let pos = 0;
    while (true) {
      const idx = textLower.indexOf(hookLower, pos);
      if (idx === -1) break;
      hookOccurrences += 1;
      pos = idx + hookLower.length;
    }
  }
  if (hookOccurrences > 1) {
    duplicateHookDetected = true;
    errors.push(
      `Duplicate hook detected: "${args.hook}" appears ${hookOccurrences} times in voiceoverText.`,
    );
  }

  // 2. Product name repetition validator:
  let prodOccurrences = 0;
  if (prodLower) {
    let pos = 0;
    while (true) {
      const idx = textLower.indexOf(prodLower, pos);
      if (idx === -1) break;
      prodOccurrences += 1;
      pos = idx + prodLower.length;
    }
  }
  if (prodOccurrences > 2) {
    errors.push(
      `Product name "${args.productName}" appears ${prodOccurrences} times (max allowed: 2). Use a shorter name.`,
    );
  } else if (prodOccurrences > 1) {
    warnings.push(`Product name appears ${prodOccurrences} times. Keep it to 1-2 times.`);
  }

  // 3. N-gram repetition (4-6 words):
  const ngramSizes = [4, 5, 6];
  for (const size of ngramSizes) {
    if (words.length >= size) {
      const seen = new Set<string>();
      for (let i = 0; i <= words.length - size; i++) {
        const ngram = words
          .slice(i, i + size)
          .join(' ')
          .toLowerCase();
        if (seen.has(ngram)) {
          ngramRepetitionDetected = true;
          errors.push(`N-gram repetition detected (${size} words): "${ngram}"`);
          break;
        }
        seen.add(ngram);
      }
    }
    if (ngramRepetitionDetected) break;
  }

  // 4. Duration estimate:
  if (args.estimatedSpeechDurationSec > args.targetDurationSec) {
    tooLongForVideo = true;
    errors.push(
      `Script is too long for the video: estimated speech duration (${args.estimatedSpeechDurationSec.toFixed(1)}s) exceeds target duration (${args.targetDurationSec.toFixed(1)}s).`,
    );
  }

  // 5. Empty/too short:
  if (wordCount < 15) {
    errors.push(`Script is too short: got only ${wordCount} words (minimum required: 15).`);
  }

  // 6. Vision Grounding Rules (Round 42):
  if (args.visionAnalysis?.analysis) {
    visionGrounded = true;
    const analysis = args.visionAnalysis.analysis;

    // 6a. Product visibility low -> Warning only (does not fail)
    if (analysis.mainProductVisible === false || (analysis.productConfidence ?? 1.0) < 0.5) {
      warnings.push(
        `LOW_PRODUCT_VISIBILITY: Main product visibility is low or confidence is under 50% (${(analysis.productConfidence ?? 1.0) * 100}%). Review source video.`,
      );
    }

    // 6b. Mismatch warnings check: if script mentions items in mismatchWarnings, add warning
    const mismatchWarnings = analysis.mismatchWarnings || [];
    const mismatchFound: string[] = [];
    for (const w of mismatchWarnings) {
      const wWords = w
        .toLowerCase()
        .split(/\s+/)
        .filter((x: string) => x.length > 2);
      if (wWords.length > 0) {
        const found = wWords.some((wd: string) => textLower.includes(wd));
        if (found) {
          mismatchFound.push(w);
        }
      }
    }
    if (mismatchFound.length > 0) {
      warnings.push(
        `Script mentions features flagged in video mismatch warnings: "${mismatchFound.join(', ')}".`,
      );
    }

    // 6c. Demonstrated features check: script should ideally mention at least some keyword from demonstratedFeatures
    const demonstratedFeatures = analysis.demonstratedFeatures || [];
    if (demonstratedFeatures.length > 0) {
      let matchedFeature = false;
      for (const feature of demonstratedFeatures) {
        const keywords = feature.toLowerCase().split(/[\s,]+/);
        const hasMatch = keywords.some((kw: string) => kw.length >= 3 && textLower.includes(kw));
        if (hasMatch) {
          matchedFeature = true;
          break;
        }
      }
      if (!matchedFeature) {
        warnings.push(
          `Script does not mention any demonstrated features from source video analysis: "${demonstratedFeatures.join(', ')}".`,
        );
      }
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    metrics: {
      duplicateHookDetected,
      repeatedProductNameCount: prodOccurrences,
      tooLongForVideo,
      ngramRepetitionDetected,
      visionGrounded,
    },
  };
}

export function scriptQualityGate(ctx: PipelineContext): void {
  if (!ctx.jobId || !ctx.jobOutputDir) return;
  const { jobId, jobOutputDir, jobManifest } = ctx;

  const scriptPath = join(jobOutputDir, 'script_artifact.json');
  if (!existsSync(scriptPath)) return;

  try {
    const scriptData = JSON.parse(readFileSync(scriptPath, 'utf8')) as ScriptArtifactData;
    if (scriptData.quality?.templateFallback) {
      console.log('⚠️  [Safe Mode] Script is a template fallback (TEMPLATE_FALLBACK_NOT_FINAL).');
    }

    const visionPath = join(jobOutputDir, 'video_visual_analysis.json');
    let visionArtifact: VisionAnalysisArtifact | null = null;
    if (existsSync(visionPath)) {
      try {
        visionArtifact = JSON.parse(readFileSync(visionPath, 'utf8')) as VisionAnalysisArtifact;
      } catch (e) {
        console.warn(`  ⚠️ Could not parse video_visual_analysis.json: ${(e as Error).message}`);
      }
    }

    // Warning: SCRIPT_NOT_VISION_GROUNDED (Round 42)
    if (visionArtifact && (!scriptData.visualContext || !scriptData.visualContext.used)) {
      console.warn(
        '⚠️  [Warning] SCRIPT_NOT_VISION_GROUNDED: Vision analysis exists but this script was not generated with vision grounding.',
      );
      console.warn('   Consider regenerating the script using:');
      console.warn(`     pnpm job:script --job ${jobId} --confirm-openai`);
    }

    // --- DUPLICATE OPENING HOOK GUARD (Round 56) ---
    // Runs before the general validator so opening repetition gets a specific
    // code and is caught before any TTS/render.
    const ttsTextForGuard = extractCombinedVoiceText(scriptPath) ?? '';
    const dup = detectOpeningRepetition(ttsTextForGuard, scriptData.hook ?? scriptData.hook3s);
    if (dup.repeated) {
      console.error('🛑 DUPLICATE_OPENING_HOOK');
      console.error(`The voiceover opening is repeated (${dup.reason}).`);
      if (dup.phrase) console.error(`  Repeated phrase: "${dup.phrase}"`);
      console.error('This usually means the hook was concatenated onto a voiceover that');
      console.error('already contains it. Regenerate the script so the opening is said once:');
      console.error(`  pnpm job:script --job ${jobId} --confirm-openai`);
      if (jobManifest) {
        jobManifest.state = 'FAILED';
        jobManifest.lastError = 'DUPLICATE_OPENING_HOOK';
        saveManifest(jobManifest);
        updateRegistryFromManifest(jobManifest);
      }
      writeStatusArtifact({ ...ctx.baseArtifact, state: 'DUPLICATE_OPENING_HOOK' });
      process.exit(24);
    }

    let sourceVideoDurationSec = 30.58;
    if (ctx.jobSourceVideoAbs && existsSync(ctx.jobSourceVideoAbs)) {
      const dur = getVideoDuration(ctx.jobSourceVideoAbs);
      if (dur > 0) sourceVideoDurationSec = dur;
    }

    // Cast giữ semantics CŨ: artifact hỏng (thiếu voiceoverText) → .trim() nổ trong
    // try → outer catch → exit 12 (KHÔNG default '' để tránh trượt sang exit 11).
    const validation = validateScript({
      voiceoverText: scriptData.voiceoverText as string,
      hook: scriptData.hook as string,
      productName: scriptData.productName as string,
      targetDurationSec: scriptData.targetDurationSec || sourceVideoDurationSec,
      estimatedSpeechDurationSec: scriptData.estimatedSpeechDurationSec || 26.5,
      visionAnalysis: visionArtifact,
    });

    if (!validation.passed) {
      console.error('🛑 SCRIPT_QUALITY_VALIDATION_FAILED');
      console.error('The existing script artifact failed the quality validator:');
      for (const err of validation.errors) {
        console.error(`  - ${err}`);
      }
      console.error('Please regenerate script with:');
      console.error(`  pnpm job:script --job ${jobId} --confirm-openai`);

      if (jobManifest) {
        jobManifest.state = 'FAILED';
        jobManifest.lastError = 'SCRIPT_QUALITY_VALIDATION_FAILED';
        saveManifest(jobManifest);
        updateRegistryFromManifest(jobManifest);
      }

      writeStatusArtifact({
        ...ctx.baseArtifact,
        state: 'SCRIPT_QUALITY_VALIDATION_FAILED',
      });
      process.exit(11);
    } else {
      console.log('🟢 Script quality validation PASSED.');
      if (validation.warnings.length > 0) {
        console.log('Warnings during script quality validation:');
        for (const wrn of validation.warnings) {
          console.warn(`  ⚠️ ${wrn}`);
        }
      }
    }

    // --- FRESHNESS GATE (Round 43) ---
    const currentScriptText = extractCombinedVoiceText(scriptPath);
    if (currentScriptText) {
      const currentScriptHash = calculateNormalizedHash(currentScriptText);

      // 1. Check voice freshness
      const voiceArtPath = join(jobOutputDir, 'voice_artifact.json');
      if (existsSync(voiceArtPath)) {
        try {
          const voiceArt = JSON.parse(readFileSync(voiceArtPath, 'utf8')) as {
            scriptTextHash?: string;
          };
          if (!voiceArt.scriptTextHash || voiceArt.scriptTextHash !== currentScriptHash) {
            console.error('\n🛑 STALE_JOB_VOICEOVER');
            console.error(
              'The generated voiceover is stale or missing hash compared to the current script.',
            );
            console.error('Operator action:');
            console.error(`  pnpm voice:elevenlabs --job ${jobId} --confirm-api-call`);

            if (jobManifest) {
              jobManifest.state = 'FAILED';
              jobManifest.lastError = 'STALE_JOB_VOICEOVER';
              saveManifest(jobManifest);
              updateRegistryFromManifest(jobManifest);
            }

            writeStatusArtifact({ ...ctx.baseArtifact, state: 'STALE_JOB_VOICEOVER' });
            process.exit(12);
          }
        } catch (err) {
          console.warn(`  ⚠️ Could not validate voice freshness: ${(err as Error).message}`);
        }
      }

      // 2. Check timing freshness
      const timingArtPath = join(jobOutputDir, 'voice_timing_artifact.json');
      if (existsSync(timingArtPath)) {
        try {
          const timingArt = JSON.parse(readFileSync(timingArtPath, 'utf8')) as {
            scriptTextHash?: string;
          };
          if (!timingArt.scriptTextHash || timingArt.scriptTextHash !== currentScriptHash) {
            console.error('\n🛑 STALE_JOB_TIMING_ARTIFACT');
            console.error(
              'The voice timing artifact is stale or missing hash compared to the current script.',
            );
            console.error('Operator action:');
            console.error(`  pnpm voice:elevenlabs --job ${jobId} --confirm-api-call`);

            if (jobManifest) {
              jobManifest.state = 'FAILED';
              jobManifest.lastError = 'STALE_JOB_TIMING_ARTIFACT';
              saveManifest(jobManifest);
              updateRegistryFromManifest(jobManifest);
            }

            writeStatusArtifact({ ...ctx.baseArtifact, state: 'STALE_JOB_TIMING_ARTIFACT' });
            process.exit(13);
          }
        } catch (err) {
          console.warn(`  ⚠️ Could not validate timing freshness: ${(err as Error).message}`);
        }
      }
    }
  } catch (err) {
    console.error(`🛑 FAILED_TO_PARSE_SCRIPT_ARTIFACT: ${(err as Error).message}`);
    process.exit(12);
  }
}
