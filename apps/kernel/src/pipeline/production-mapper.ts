/**
 * Production Mapper — Coordinates file paths and dynamic input/output mappings for production-like runs.
 *
 * Provides repository-relative resolution of input candidate files and output directories.
 */

import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

export interface RunContext {
  runId: string;
  videoId?: string;
  lane: string;
}

export class ProductionMapper {
  private readonly baseDir = 'data/temp/pipeline-p6-demo';

  constructor(private readonly repoRoot: string = '.') {}

  /**
   * Resolves and ensures the run-specific artifact output directory exists.
   */
  getRunDir(runId: string): string {
    const dir = join(this.repoRoot, this.baseDir, runId);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * Resolves path to the offline shopee product candidates source file.
   */
  getProductCandidatesPath(): string {
    return join(this.repoRoot, 'production/_commerce/shopee_product_candidates.json');
  }

  /**
   * Resolves path for the selection step output card.
   */
  getSelectedProductCardPath(runId: string): string {
    return join(this.getRunDir(runId), 'selected_product_card.json');
  }

  /**
   * Resolves path for the unified matching validation artifact used by ProductMatchGuard.
   */
  getProductMatchArtifactPath(runId: string): string {
    return join(this.getRunDir(runId), 'product_match_artifact.json');
  }
}
