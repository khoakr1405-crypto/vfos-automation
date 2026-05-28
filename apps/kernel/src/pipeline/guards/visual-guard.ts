/**
 * Visual Guard — Validates portrait formatting, duration limits, watermarks, and black frames.
 *
 * Implements dry-run rules for technical safety validation before publishing (Shorts/Reels).
 * Prevents downstream publishing of invalid aspect ratios, tiny durations, or watermarked content.
 */

import { readFileSync, existsSync } from 'node:fs';
import type { Guard } from '../guard-runner.js';

export class VisualGuard implements Guard {
  readonly guardName = 'VisualGuard';
  readonly targetStep = 'demo:visual-check';

  async validate(
    artifactPath: string,
  ): Promise<Omit<import('../guard-runner.js').GuardReport, 'startedAt' | 'finishedAt' | 'durationMs' | 'artifactPath'>> {
    const reasons: string[] = [];
    let severity: 'info' | 'warning' | 'blocking' = 'info';

    // 1. Verify existence
    if (!existsSync(artifactPath)) {
      return {
        guardName: this.guardName,
        targetStep: this.targetStep,
        status: 'fail',
        severity: 'blocking',
        reasons: ['Visual metadata artifact file does not exist.'],
        details: `Path: ${artifactPath}`,
      };
    }

    // 2. Read file content
    let rawContent = '';
    try {
      rawContent = readFileSync(artifactPath, 'utf8').trim();
    } catch (err) {
      return {
        guardName: this.guardName,
        targetStep: this.targetStep,
        status: 'fail',
        severity: 'blocking',
        reasons: ['Unable to read visual metadata file.'],
        details: err instanceof Error ? err.message : String(err),
      };
    }

    // 3. Try parsing JSON
    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch (err) {
      return {
        guardName: this.guardName,
        targetStep: this.targetStep,
        status: 'fail',
        severity: 'blocking',
        reasons: ['Unable to parse visual metadata JSON.'],
        details: err instanceof Error ? err.message : String(err),
      };
    }

    // 4. Schema verification
    if (!parsed || typeof parsed !== 'object') {
      return {
        guardName: this.guardName,
        targetStep: this.targetStep,
        status: 'fail',
        severity: 'blocking',
        reasons: ['Invalid visual metadata JSON structure.'],
      };
    }

    const {
      durationSec,
      width,
      height,
      aspectRatio,
      hasWatermark,
      hasVisibleBrandLogo,
      hasBlackFrames,
      hasFrozenFrames,
    } = parsed;

    if (durationSec === undefined || aspectRatio === undefined) {
      return {
        guardName: this.guardName,
        targetStep: this.targetStep,
        status: 'fail',
        severity: 'blocking',
        reasons: ['Missing critical metadata keys (durationSec, aspectRatio).'],
      };
    }

    // 5. Check duration bounds
    if (durationSec < 8) {
      reasons.push(`Video is too short: ${durationSec}s. Minimum expected duration is 8s.`);
      severity = 'blocking';
    } else if (durationSec > 60) {
      reasons.push(`Video exceeds standard Reels/Shorts limit: ${durationSec}s.`);
      severity = 'warning';
    }

    // 6. Check aspect ratio
    if (aspectRatio !== '9:16') {
      reasons.push(`Invalid aspect ratio: ${aspectRatio}. Standard vertical portrait is 9:16.`);
      severity = 'blocking'; // Hard block for landscape content on Shorts/Reels lane
    }

    // 7. Check resolution (minimum vertical bounds)
    if (width && height) {
      if (height < 720 || width < 480) {
        reasons.push(`Low resolution detected: ${width}x${height}. Expected at least 720p level.`);
        if (severity !== 'blocking') severity = 'warning';
      }
    }

    // 8. Check watermark
    if (hasWatermark === true) {
      reasons.push('Watermark detected in video stream.');
      severity = 'blocking'; // Hard block to prevent copyright claims or platform shadowbans
    }

    // 9. Check brand logo
    if (hasVisibleBrandLogo === true) {
      reasons.push('Visible competitor brand/logo identified.');
      if (severity !== 'blocking') severity = 'warning';
    }

    // 10. Check black frames / frozen frames
    if (hasBlackFrames === true) {
      reasons.push('Black frame rendering dropouts identified.');
      severity = 'blocking';
    }

    if (hasFrozenFrames === true) {
      reasons.push('Frozen/stuck frame rendering failure identified.');
      if (severity !== 'blocking') severity = 'warning';
    }

    // 11. Evaluate status
    const hasFailures = reasons.length > 0;
    if (!hasFailures) {
      return {
        guardName: this.guardName,
        targetStep: this.targetStep,
        status: 'pass',
        severity: 'info',
        reasons: [],
        details: `Validated portrait vertical specs successfully. Aspect ratio: ${aspectRatio}. Duration: ${durationSec}s. Resolution: ${width || 'unknown'}x${height || 'unknown'}.`,
      };
    }

    return {
      guardName: this.guardName,
      targetStep: this.targetStep,
      status: severity === 'blocking' ? 'fail' : 'warn',
      severity,
      reasons,
      details: `Visual specifications audit: ${reasons.join(' | ')}`,
    };
  }
}
