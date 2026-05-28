/**
 * Artifact Gate — Validate expected pipeline step outputs.
 *
 * Scans directories to verify step-expected files are present,
 * populated (non-empty), and valid. Serves as a quality gate
 * preventing pipelines from moving forward with corrupted data.
 */

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Logger } from 'pino';

export interface ArtifactValidationReport {
  path: string;
  exists: boolean;
  sizeBytes: number;
  valid: boolean;
  reason: string | null;
}

export interface GateReport {
  passed: boolean;
  validations: ArtifactValidationReport[];
}

export class ArtifactGate {
  constructor(
    private readonly logger: Logger,
    private readonly rootDir: string = '.',
  ) {}

  /**
   * Validates a collection of expected file outputs.
   * Paths are evaluated relative to rootDir.
   */
  validate(expectedPaths: string[]): GateReport {
    this.logger.debug({ expectedPaths }, 'artifact-gate.check.start');
    const validations: ArtifactValidationReport[] = [];
    let passed = true;

    for (const relPath of expectedPaths) {
      const absPath = resolve(this.rootDir, relPath);
      let exists = false;
      let sizeBytes = 0;
      let valid = false;
      let reason: string | null = null;

      try {
        if (existsSync(absPath)) {
          exists = true;
          const stats = statSync(absPath);
          sizeBytes = stats.size;

          if (stats.isFile()) {
            if (sizeBytes > 0) {
              valid = true;
            } else {
              reason = 'File is empty (0 bytes)';
            }
          } else {
            reason = 'Path exists but is not a file';
          }
        } else {
          reason = 'File does not exist';
        }
      } catch (err) {
        reason = `Error querying filesystem: ${err instanceof Error ? err.message : String(err)}`;
      }

      if (!valid) {
        passed = false;
      }

      validations.push({
        path: relPath,
        exists,
        sizeBytes,
        valid,
        reason,
      });
    }

    this.logger.info(
      { passed, checkedCount: expectedPaths.length, failedCount: validations.filter((v) => !v.valid).length },
      'artifact-gate.check.finished',
    );

    return { passed, validations };
  }
}
