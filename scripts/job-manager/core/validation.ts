// Script validation + final-QA status reader (extracted from
// scripts/vfos-job-manager.ts — God-file anatomy Nhịp 1). Behavior-preserving;
// only line-452 `a && a.b` → `a?.b` (biome useOptionalChain).

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { JobManifest, ValidationResult } from './types.js';

export function validateScript(args: {
  voiceoverText: string;
  hook: string;
  productName: string;
  targetDurationSec: number;
  estimatedSpeechDurationSec: number;
  // biome-ignore lint/suspicious/noExplicitAny: visionAnalysis is dynamic vision JSON from an external analyzer
  visionAnalysis?: any;
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

// Read the authoritative final QA status from the report file itself (not just
// the manifest mirror) so approve cannot pass on a stale/edited manifest.
export function readFinalQaStatus(manifest: JobManifest): 'PASS' | 'FAIL' | 'MISSING' {
  const reportRel = manifest.artifacts.finalQaReportPath;
  if (!reportRel) return 'MISSING';
  const reportAbs = resolve(reportRel);
  if (!existsSync(reportAbs)) return 'MISSING';
  try {
    const report = JSON.parse(readFileSync(reportAbs, 'utf8')) as { status?: string };
    return report.status === 'PASS' ? 'PASS' : 'FAIL';
  } catch {
    return 'FAIL';
  }
}
