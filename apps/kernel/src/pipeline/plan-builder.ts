/**
 * Pipeline Plan Builder — Generates declarative JSON execution plans for the Auto-Pipeline.
 *
 * Upgraded in P9 to read, validate, and merge a dynamic Run Manifest with static Lane Configurations.
 */

import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
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
  laneConfigPath: string;
  runId: string;
  stepCount: number;
  outputDir: string;
}

// ── Lane Config Types ──────────────────────────────────────────────────────

export interface LaneConfigStepTemplate {
  stepName: string;
  description: string;
  command: string;
  argsTemplate: string[];
  cwd: string;
  timeoutMs: number;
  expectedArtifacts?: {
    pathTemplate: string;
    required: boolean;
    nonEmpty: boolean;
  }[];
  guards?: {
    guardName: string;
    artifactPathTemplate: string;
    blocking: boolean;
  }[];
}

export interface LaneConfig {
  laneVersion: string;
  lane: string;
  description: string;
  defaults?: {
    timeoutMs?: number;
    outputDirPattern?: string;
  };
  steps: LaneConfigStepTemplate[];
}

// ── Run Manifest Types (P9) ───────────────────────────────────────────────

export interface RunManifest {
  manifestVersion: string;
  lane: string;
  runId: string;
  subject: string;
  mode: string;
  inputs: {
    productCandidatesPath: string;
    videoCandidateMetadataPath: string;
    [key: string]: any;
  };
  output: {
    rootDir: string;
  };
  operatorApproval: {
    requiresPreviewApproval: boolean;
    allowPublish: boolean;
    allowExternalApi: boolean;
  };
  metadata?: Record<string, any>;
}

export class PlanBuilder {
  constructor(private readonly repoRoot: string = '.') {}

  /**
   * Generates a pipeline_plan.json by loading a versioned Run Manifest, validating safety gates,
   * merging it with a static Lane Config, and executing template interpolation.
   */
  buildPlanFromManifest(
    manifestPath: string,
    options?: {
      mode?: 'pass' | 'product-fail' | 'invalid-manifest' | 'unsafe-manifest';
    },
  ): BuildPlanResult {
    // Handle invalid manifest simulation before loading
    if (options?.mode === 'invalid-manifest') {
      throw new Error('Run Manifest Validation Failed: Manifest file is malformed or missing key identifier fields.');
    }

    const resolvedManifestPath = join(this.repoRoot, manifestPath);
    if (!existsSync(resolvedManifestPath)) {
      throw new Error(`Run Manifest file not found at: ${resolvedManifestPath}`);
    }

    let manifest: RunManifest;
    try {
      manifest = JSON.parse(readFileSync(resolvedManifestPath, 'utf8'));
    } catch (err: any) {
      throw new Error(`Failed to parse Run Manifest JSON: ${err.message}`);
    }

    // 1. Thorough Run Manifest Validation (Safety & Structure)
    if (!manifest.manifestVersion || manifest.manifestVersion !== 'v1') {
      throw new Error('Run Manifest Validation Failed: missing or invalid "manifestVersion" (must be "v1").');
    }
    if (!manifest.lane || manifest.lane !== 'review_product') {
      throw new Error('Run Manifest Validation Failed: missing or invalid "lane" field (must be "review_product").');
    }
    if (!manifest.runId || typeof manifest.runId !== 'string') {
      throw new Error('Run Manifest Validation Failed: missing "runId".');
    }
    if (!manifest.subject || typeof manifest.subject !== 'string') {
      throw new Error('Run Manifest Validation Failed: missing "subject".');
    }
    if (!manifest.inputs || !manifest.inputs.productCandidatesPath || !manifest.inputs.videoCandidateMetadataPath) {
      throw new Error('Run Manifest Validation Failed: missing inputs productCandidatesPath or videoCandidateMetadataPath.');
    }
    if (!manifest.output || !manifest.output.rootDir) {
      throw new Error('Run Manifest Validation Failed: missing output rootDir.');
    }
    if (!manifest.operatorApproval) {
      throw new Error('Run Manifest Validation Failed: missing operatorApproval settings.');
    }

    // 2. Strict Safety Gate Checks (allowExternalApi & allowPublish)
    if (
      manifest.operatorApproval.allowExternalApi === true ||
      manifest.operatorApproval.allowPublish === true ||
      options?.mode === 'unsafe-manifest'
    ) {
      throw new Error(
        'Safety Gate Violation: Manifest requests live operations (external API or publishing) which is strictly forbidden in this offline dry-run pilot.',
      );
    }

    // 3. Resolve Lane Config Path
    const laneConfigPath = join(this.repoRoot, 'apps/kernel/config/lanes', `${manifest.lane}.json`);

    // 4. Delegate to core buildPlan with dynamic values merged
    const runId = manifest.runId;
    const outputDir = join(manifest.output.rootDir, runId);
    const mode = options?.mode || (manifest.mode as any) || 'pass';

    return this.buildPlan({
      runId,
      subject: manifest.subject,
      selectedProductCardPath: join(this.repoRoot, manifest.inputs.productCandidatesPath),
      videoCandidateMetadataPath: join(this.repoRoot, manifest.inputs.videoCandidateMetadataPath),
      outputDir,
      laneConfigPath,
      mode,
    });
  }

  /**
   * Generates a pipeline_plan.json by loading a versioned Lane Template and interpolating variables.
   */
  buildPlan(options: {
    runId: string;
    subject: string;
    selectedProductCardPath: string;
    videoCandidateMetadataPath: string;
    outputDir: string;
    laneConfigPath?: string; // Optional path, defaults to review_product
    mode?: 'pass' | 'product-fail' | 'missing-input' | 'invalid-plan' | 'invalid-config' | 'invalid-manifest' | 'unsafe-manifest' | 'local-preview' | 'preview-fail' | 'approval-reject' | 'approval-pending' | 'publish-fail';
  }): BuildPlanResult {
    const runId = options.runId;
    const resolvedOutputDir = join(this.repoRoot, options.outputDir);

    // 1. Resolve Lane Config Path
    const configPath =
      options.laneConfigPath ||
      join(this.repoRoot, 'apps/kernel/config/lanes/review_product.json');

    // Handle invalid config simulation before loading
    if (options.mode === 'invalid-config') {
      throw new Error('Lane Config Validation Failed: Lane configuration file is malformed or missing steps.');
    }

    // 2. Validate input files existence
    if (options.mode !== 'invalid-plan' && options.mode !== 'invalid-manifest' && options.mode !== 'unsafe-manifest') {
      if (!existsSync(options.selectedProductCardPath)) {
        throw new Error(`Input selectedProductCard file not found: ${options.selectedProductCardPath}`);
      }
      if (!existsSync(options.videoCandidateMetadataPath)) {
        throw new Error(`Input videoCandidateMetadata file not found: ${options.videoCandidateMetadataPath}`);
      }
    }

    // 3. Load Lane Config
    if (!existsSync(configPath)) {
      throw new Error(`Lane configuration file not found at: ${configPath}`);
    }

    let laneConfig: LaneConfig;
    try {
      laneConfig = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch (err: any) {
      throw new Error(`Failed to parse Lane Config JSON: ${err.message}`);
    }

    // 4. Validate Lane Config Schema Thoroughly ("Validate lane config kỹ")
    if (!laneConfig.lane || laneConfig.lane !== 'review_product') {
      throw new Error(`Lane Config Validation Failed: missing or invalid "lane" field (must be "review_product").`);
    }
    if (!laneConfig.laneVersion || laneConfig.laneVersion !== 'v1') {
      throw new Error(`Lane Config Validation Failed: missing or invalid "laneVersion" (must be "v1").`);
    }
    if (!laneConfig.steps || !Array.isArray(laneConfig.steps) || laneConfig.steps.length === 0) {
      throw new Error(`Lane Config Validation Failed: "steps" array must be present and non-empty.`);
    }

    for (const step of laneConfig.steps) {
      if (!step.stepName || !step.command || !step.argsTemplate || !step.cwd || step.timeoutMs === undefined) {
        throw new Error(
          `Lane Config Validation Failed: step "${step.stepName || 'unnamed'}" must contain stepName, command, argsTemplate, cwd, and timeoutMs.`,
        );
      }
    }

    // 5. Setup Interpolation Variables
    const vars: Record<string, string> = {
      runId,
      outputDir: resolvedOutputDir,
      mode: options.mode || 'pass',
      'inputs.productCandidatesPath': options.selectedProductCardPath,
      publishCommand:
        options.mode === 'product-fail'
          ? `"console.error('ERROR: Downstream should not run when product mismatch occurs!'); process.exit(1);"`
          : `"console.log('Simulating video publish step after plan-builder pass...');"`,
    };

    const interpolate = (str: string): string => {
      return str.replace(/\{([^{}]+)\}/g, (match: string, key: string): string => {
        if (key in vars) {
          return vars[key] ?? '';
        }
        throw new Error(`Missing template variable: ${key}`);
      });
    };

    // 6. Build dynamic plan steps by executing template interpolation
    const steps: PlanStepDefinition[] = [];

    if (options.mode !== 'invalid-plan') {
      for (const stepTemplate of laneConfig.steps) {
        // Interpolate arguments array
        const args: string[] = [];
        for (const argTemplate of stepTemplate.argsTemplate || []) {
          if (argTemplate === '{extraArgs}') {
            if (options.mode === 'product-fail') {
              args.push('--detectedProductName', '"Bông tắm lưới xơ mướp"', '--forceMatchAxes', 'blocking-fail');
            } else {
              args.push('--forceMatchAxes', 'all-pass');
            }
          } else {
            args.push(interpolate(argTemplate));
          }
        }

        // Interpolate expected artifacts paths
        const expectedArtifacts: ExpectedArtifactSpec[] = (stepTemplate.expectedArtifacts || []).map((art) => ({
          path: interpolate(art.pathTemplate),
          required: art.required,
          nonEmpty: art.nonEmpty,
        }));

        // Interpolate guard binding paths
        const guards: GuardBindingSpec[] = (stepTemplate.guards || []).map((g) => ({
          guardName: g.guardName,
          artifactPath: interpolate(g.artifactPathTemplate),
          blocking: g.blocking,
        }));

        const planStep: PlanStepDefinition = {
          stepName: stepTemplate.stepName,
          description: stepTemplate.description || '',
          command: stepTemplate.command,
          args,
          cwd: stepTemplate.cwd,
          timeoutMs: stepTemplate.timeoutMs,
          expectedArtifacts,
        };

        if (guards.length > 0) {
          planStep.guards = guards;
        }

        steps.push(planStep);
      }
    }

    const plan: PipelinePlan = {
      planVersion: laneConfig.laneVersion,
      lane: laneConfig.lane,
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
      laneConfigPath: configPath,
      runId,
      stepCount: steps.length,
      outputDir: resolvedOutputDir,
    };
  }
}
