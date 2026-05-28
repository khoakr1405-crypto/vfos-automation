/**
 * Product Match Guard — Validates alignment between video candidate features and Shopee product metadata.
 *
 * Implements 5-axis checking: function, form factor, usage, context, product nature.
 * Prevents pipeline execution if product match scores are insufficient.
 */

import { readFileSync, existsSync } from 'node:fs';
import type { Guard } from '../guard-runner.js';

export class ProductMatchGuard implements Guard {
  readonly guardName = 'ProductMatchGuard';
  readonly targetStep = 'demo:product-match';

  async validate(
    artifactPath: string,
  ): Promise<Omit<import('../guard-runner.js').GuardReport, 'startedAt' | 'finishedAt' | 'durationMs' | 'artifactPath'>> {
    const reasons: string[] = [];

    // 1. Verify existence
    if (!existsSync(artifactPath)) {
      return {
        guardName: this.guardName,
        targetStep: this.targetStep,
        status: 'fail',
        severity: 'blocking',
        reasons: ['Product match artifact file does not exist.'],
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
        reasons: ['Unable to read product match file.'],
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
        reasons: ['Unable to parse product match JSON.'],
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
        reasons: ['Invalid product match JSON structure.'],
      };
    }

    const { shopeeProduct, videoCandidate, matchAxes } = parsed;

    if (!shopeeProduct || !videoCandidate || !matchAxes) {
      return {
        guardName: this.guardName,
        targetStep: this.targetStep,
        status: 'fail',
        severity: 'blocking',
        reasons: ['Missing required schema properties (shopeeProduct, videoCandidate, matchAxes).'],
      };
    }

    // 5. Check the 5 match axes
    const axesKeys = ['function', 'formFactor', 'usage', 'context', 'productNature'] as const;
    const missingAxesKeys: string[] = [];
    const failedAxes: string[] = [];
    let score = 0;

    for (const key of axesKeys) {
      if (matchAxes[key] === undefined) {
        missingAxesKeys.push(key);
      } else if (matchAxes[key] === true) {
        score++;
      } else {
        failedAxes.push(key);
      }
    }

    if (missingAxesKeys.length > 0) {
      return {
        guardName: this.guardName,
        targetStep: this.targetStep,
        status: 'fail',
        severity: 'blocking',
        reasons: [`Missing definition for match axes: ${missingAxesKeys.join(', ')}`],
      };
    }

    const totalAxes = axesKeys.length;
    const details = `Score: ${score}/${totalAxes}. Failed axes: [${failedAxes.join(', ')}]. Candidate: ${videoCandidate.detectedProductName || 'unknown'}. Shopee Product: ${shopeeProduct.name || 'unknown'}.`;

    // 6. Evaluate matching threshold rules
    if (score === totalAxes) {
      return {
        guardName: this.guardName,
        targetStep: this.targetStep,
        status: 'pass',
        severity: 'info',
        reasons: [],
        details,
      };
    }

    if (score === totalAxes - 1) {
      return {
        guardName: this.guardName,
        targetStep: this.targetStep,
        status: 'warn',
        severity: 'warning',
        reasons: [`Minor product mismatch identified. Axis failed: ${failedAxes.join(', ')}`],
        details,
      };
    }

    // Less than 4/5 axes matches -> blocking failure
    return {
      guardName: this.guardName,
      targetStep: this.targetStep,
      status: 'fail',
      severity: 'blocking',
      reasons: [`Severe product mismatch: only scored ${score}/${totalAxes}. Failures: ${failedAxes.join(', ')}`],
      details,
    };
  }
}
