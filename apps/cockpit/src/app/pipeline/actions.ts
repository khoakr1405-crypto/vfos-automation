'use server';

import { runPipeline, type PipelineResult } from '@/lib/kernel';

export interface RunPipelineState {
  status: 'idle' | 'success' | 'error';
  result?: PipelineResult;
  message?: string;
  request?: {
    source_url: string;
    target_platforms: ('tiktok' | 'facebook')[];
    caption: string;
  };
}

const VALID_PLATFORMS: ('tiktok' | 'facebook')[] = ['tiktok', 'facebook'];

export async function runPipelineAction(
  _prev: RunPipelineState,
  formData: FormData,
): Promise<RunPipelineState> {
  const source_url = String(formData.get('source_url') ?? '').trim();
  // Multi-select via repeated `target_platforms` form field.
  const rawPlatforms = formData.getAll('target_platforms').map(String);
  const target_platforms = VALID_PLATFORMS.filter((p) => rawPlatforms.includes(p));
  if (target_platforms.length === 0) {
    return { status: 'error', message: 'select at least one target platform' };
  }
  const caption = String(formData.get('caption') ?? '').trim();
  const transcript = String(formData.get('transcript') ?? '').trim();
  const niche_hint = String(formData.get('niche_hint') ?? '').trim();
  try {
    const payload: Parameters<typeof runPipeline>[0] = { target_platforms };
    if (source_url) payload.source_url = source_url;
    if (caption) payload.caption = caption;
    if (transcript) payload.transcript = transcript;
    if (niche_hint) payload.niche_hint = niche_hint;
    const result = await runPipeline(payload);
    return {
      status: 'success',
      result,
      request: { source_url, target_platforms, caption },
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
