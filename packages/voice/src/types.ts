export interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  speed: number;
}

export interface TTSResult {
  audio_path: string;
  character_count: number;
}

export interface DurationProbeResult {
  duration_s: number;
  format: string;
  bitrate_bps: number;
}

export type AlignmentStatus =
  | 'accepted'
  | 'speed_adjusted'
  | 'converged'
  | 'failed_max_iter'
  | 'failed_api_error';

// Used by future VDAE orchestrator — defined here so v1 can import without breaking changes
export interface BlockVoiceResult {
  block_id: string;
  target_duration_s: number;
  actual_duration_s: number;
  duration_delta_s: number;
  iterations_used: number;
  status: AlignmentStatus;
  final_script: string;
  audio_path: string;
  timestamps_path?: string | undefined;
  subtitles_path?: string | undefined;
  speed_factor_applied?: number | undefined;
}

export interface ElevenLabsClientConfig {
  apiKey: string;
  voiceId: string;
  modelId?: string | undefined;
}
