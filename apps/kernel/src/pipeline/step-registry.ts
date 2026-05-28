/**
 * Step Registry — Schema and configuration for pipeline steps.
 *
 * This defines how child processes (production scripts) are configured,
 * detailing their command, args, timeouts, and expected artifact outputs.
 * In later phases (P2+), the Auto-Pipeline will execute these in order.
 */

export interface StepDefinition {
  stepName: string;
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  expectedArtifacts: string[];
  description: string;
}

/**
 * Built-in step definitions for the review_product lane.
 * Note: CWD and commands are configured but not executed yet.
 */
export const PIPELINE_STEPS: Record<string, StepDefinition> = {
  'shopee:resolve': {
    stepName: 'shopee:resolve',
    command: 'pnpm',
    args: ['shopee:resolve-canonical'], // Example placeholder script arg
    cwd: '.',
    timeoutMs: 60_000,
    expectedArtifacts: ['shopee/shopee_product_card.json'],
    description: 'Resolve Shopee short links and fetch metadata via CDP Browser.',
  },
  'demo:match': {
    stepName: 'demo:match',
    command: 'pnpm',
    args: ['demo:match-candidate'],
    cwd: '.',
    timeoutMs: 90_000,
    expectedArtifacts: ['demo_match/match_result.json'],
    description: 'Find similar video candidates from TikTok/Douyin/AliExpress.',
  },
  'script:generate': {
    stepName: 'script:generate',
    command: 'pnpm',
    args: ['script:generate-draft'],
    cwd: '.',
    timeoutMs: 45_000,
    expectedArtifacts: ['script/script_ai_v1_extended.json'],
    description: 'Generate advertising script with quality budgets and hooks.',
  },
  'script:guard': {
    stepName: 'script:guard',
    command: 'pnpm',
    args: ['script:check-safety'],
    cwd: '.',
    timeoutMs: 20_000,
    expectedArtifacts: ['script/subtitle_overlay_plan.json'],
    description: 'Scan generated script for claims safety and banned phrases.',
  },
  'voice:generate': {
    stepName: 'voice:generate',
    command: 'pnpm',
    args: ['voice:tts'],
    cwd: '.',
    timeoutMs: 90_000,
    expectedArtifacts: ['voice/voice_sync_manifest.json'],
    description: 'Synthesize audio clips using ElevenLabs TTS.',
  },
  'bgm:mix': {
    stepName: 'bgm:mix',
    command: 'pnpm',
    args: ['bgm:mix-track'],
    cwd: '.',
    timeoutMs: 30_000,
    expectedArtifacts: ['bgm/bgm_mix_manifest.json'],
    description: 'Mix ElevenLabs voice synthesis with BGM overlay tracks.',
  },
  'final:render': {
    stepName: 'final:render',
    command: 'pnpm',
    args: ['render:mux'],
    cwd: '.',
    timeoutMs: 120_000,
    expectedArtifacts: ['preview/reels_preview.mp4'],
    description: 'Render final 9:16 reels with FFmpeg subtitles and crops.',
  },
  'publish:plan': {
    stepName: 'publish:plan',
    command: 'pnpm',
    args: ['publish:draft-plan'],
    cwd: '.',
    timeoutMs: 30_000,
    expectedArtifacts: ['publish/facebook_reels_publish_plan.json'],
    description: 'Draft Facebook Reels caption and schedule metadata.',
  },
  'production-like:select-product-offline': {
    stepName: 'production-like:select-product-offline',
    command: 'pnpm',
    args: ['offline-product-select'],
    cwd: '.',
    timeoutMs: 30_000,
    expectedArtifacts: ['data/temp/pipeline-p6-demo/selected_product_card.json'],
    description: 'Production-like offline Shopee product candidate selection.',
  },
};

export class StepRegistry {
  private readonly steps = new Map<string, StepDefinition>();

  constructor() {
    for (const [name, def] of Object.entries(PIPELINE_STEPS)) {
      this.steps.set(name, def);
    }
  }

  getStep(name: string): StepDefinition | null {
    return this.steps.get(name) ?? null;
  }

  listSteps(): StepDefinition[] {
    return [...this.steps.values()];
  }
}
