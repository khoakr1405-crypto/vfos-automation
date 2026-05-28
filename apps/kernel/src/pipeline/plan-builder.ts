/**
 * Pipeline Plan Builder — Generates declarative JSON execution plans for the Auto-Pipeline.
 *
 * Taches execution blueprint (steps, artifacts, guards) from input metadata.
 */

import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface ExpectedArtifactSpec {
  path: string;
  required: boolean;
  nonEmpty: boolean;
}

export interface GuardBindingSpec {
  guardName: string;
  artifactPath: string;
  blocking: boolean;
}

export interface PlanStepDefinition {
  stepName: string;
  description: string;
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  expectedArtifacts: ExpectedArtifactSpec[];
  guards?: GuardBindingSpec[];
}

export interface PipelinePlan {
  planVersion: string;
  lane: string;
  runId: string;
  subject: string;
  createdAt: string;
  inputs: {
    selectedProductCard: string;
    videoCandidateMetadata: string;
  };
  outputDir: string;
  steps: PlanStepDefinition[];
}

export interface BuildPlanResult {
  planPath: string;
  runId: string;
  stepCount: number;
  outputDir: string;
}

export class PlanBuilder {
  constructor(private readonly repoRoot: string = '.') {}

  /**
   * Generates a pipeline_plan.json dynamically for the review_product lane.
   */
  buildPlan(options: {
    runId: string;
    subject: string;
    selectedProductCardPath: string;
    videoCandidateMetadataPath: string;
    outputDir: string;
    mode?: 'pass' | 'product-fail' | 'missing-input' | 'invalid-plan';
  }): BuildPlanResult {
    const runId = options.runId;
    const resolvedOutputDir = join(this.repoRoot, options.outputDir);

    // 1. Validate inputs existence unless simulating invalid plan mode
    if (options.mode !== 'invalid-plan') {
      if (!existsSync(options.selectedProductCardPath)) {
        throw new Error(`Input selectedProductCard file not found: ${options.selectedProductCardPath}`);
      }
      if (!existsSync(options.videoCandidateMetadataPath)) {
        throw new Error(`Input videoCandidateMetadata file not found: ${options.videoCandidateMetadataPath}`);
      }
    }

    const outArtifactPath = join(resolvedOutputDir, 'product_match_artifact.json');

    // 2. Build steps list
    const steps: PlanStepDefinition[] = [];

    if (options.mode !== 'invalid-plan') {
      // Step 1: Product Selection & Matching
      steps.push({
        stepName: 'demo:product-match',
        description: 'Production-like offline Shopee candidate selection',
        command: 'tsx',
        args: [
          'scripts/offline-product-select-demo.ts',
          '--candidatesFile',
          options.selectedProductCardPath,
          '--outFile',
          outArtifactPath,
          '--productId',
          '2', // Select candidate 2 (Quạt cầm tay mini) by default
          ...(options.mode === 'product-fail'
            ? ['--detectedProductName', '"Bông tắm lưới xơ mướp"', '--forceMatchAxes', 'blocking-fail']
            : ['--forceMatchAxes', 'all-pass']),
        ],
        cwd: '.',
        timeoutMs: 15000,
        expectedArtifacts: [
          {
            path: outArtifactPath,
            required: true,
            nonEmpty: true,
          },
        ],
        guards: [
          {
            guardName: 'ProductMatchGuard',
            artifactPath: outArtifactPath,
            blocking: true,
          },
        ],
      });

      // Step 2: Publish Simulation
      steps.push({
        stepName: 'demo:publish',
        description: 'Downstream Publish Step',
        command: 'node',
        args: [
          '-e',
          options.mode === 'product-fail'
            ? `"console.error('ERROR: Downstream should not run when product mismatch occurs!'); process.exit(1);"`
            : `"console.log('Simulating video publish step after plan-builder pass...');"`,
        ],
        cwd: '.',
        timeoutMs: 5000,
        expectedArtifacts: [],
      });
    }

    const plan: PipelinePlan = {
      planVersion: 'v1',
      lane: 'review_product',
      runId,
      subject: options.subject,
      createdAt: new Date().toISOString(),
      inputs: {
        selectedProductCard: options.selectedProductCardPath,
        videoCandidateMetadata: options.videoCandidateMetadataPath,
      },
      outputDir: resolvedOutputDir,
      steps,
    };

    // Ensure outputDir directory exists
    if (!existsSync(resolvedOutputDir)) {
      mkdirSync(resolvedOutputDir, { recursive: true });
    }

    const planPath = join(resolvedOutputDir, 'pipeline_plan.json');
    writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf8');

    return {
      planPath,
      runId,
      stepCount: steps.length,
      outputDir: resolvedOutputDir,
    };
  }
}
