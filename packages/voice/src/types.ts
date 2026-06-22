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

/** Character-level alignment as returned by ElevenLabs `/with-timestamps`. */
export interface CharAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/** Result of `/with-timestamps`: audio written to disk + char-level timing. */
export interface TTSTimestampsResult {
  audio_path: string;
  character_count: number;
  model_used: string;
  alignment: CharAlignment;
  normalized_alignment: CharAlignment;
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
