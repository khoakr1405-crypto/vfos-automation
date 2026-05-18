/**
 * Voice Preset Library v0 — resolves named presets to ElevenLabs voice IDs.
 *
 * Presets map to env vars:
 *   default  → ELEVENLABS_VOICE_ID
 *   voice_01 → ELEVENLABS_VOICE_ID_01
 *   voice_02 → ELEVENLABS_VOICE_ID_02
 *   voice_03 → ELEVENLABS_VOICE_ID_03
 *   voice_04 → ELEVENLABS_VOICE_ID_04
 *   voice_05 → ELEVENLABS_VOICE_ID_05
 *
 * Add new presets by extending PRESET_ENV_MAP and declaring the matching env var.
 * Operator selects preset via --voice-preset <name>; never hardcode voice IDs in source.
 */

const PRESET_ENV_MAP: Record<string, string> = {
  default:  'ELEVENLABS_VOICE_ID',
  voice_01: 'ELEVENLABS_VOICE_ID_01',
  voice_02: 'ELEVENLABS_VOICE_ID_02',
  voice_03: 'ELEVENLABS_VOICE_ID_03',
  voice_04: 'ELEVENLABS_VOICE_ID_04',
  voice_05: 'ELEVENLABS_VOICE_ID_05',
};

export const VALID_PRESETS = Object.keys(PRESET_ENV_MAP);

/**
 * Resolve a preset name → voice ID string.
 * Exits process with error if preset is unknown or env var is unset.
 */
export function resolveVoicePreset(preset: string): string {
  const envVar = PRESET_ENV_MAP[preset];
  if (!envVar) {
    console.error(`Error: unknown voice preset "${preset}"`);
    console.error(`  Valid presets: ${VALID_PRESETS.join(', ')}`);
    process.exit(1);
  }
  const voiceId = process.env[envVar];
  if (!voiceId) {
    console.error(`Error: voice preset "${preset}" maps to ${envVar} but it is not set in .env`);
    console.error(`  Add ${envVar}=<elevenlabs_voice_id> to your .env file`);
    process.exit(1);
  }
  return voiceId;
}

/**
 * Resolve voice ID from CLI flags with priority:
 *   1. --voice-id <raw_id>    (direct override, backward-compat — preset recorded as null)
 *   2. --voice-preset <name>  (lookup via PRESET_ENV_MAP)
 *   3. ELEVENLABS_VOICE_ID    (default preset, same as passing --voice-preset default)
 *
 * Passing both --voice-id and --voice-preset is an error.
 *
 * Returns { voiceId, preset } for manifest traceability.
 * preset is null when --voice-id is used with a raw ID not tied to any preset.
 */
export function resolveVoice(args: {
  voiceId?: string | undefined;
  voicePreset?: string | undefined;
}): { voiceId: string; preset: string | null } {
  if (args.voiceId && args.voicePreset) {
    console.error('Error: specify only one of --voice-id or --voice-preset, not both');
    process.exit(1);
  }

  if (args.voiceId) {
    return { voiceId: args.voiceId, preset: null };
  }

  if (args.voicePreset) {
    return { voiceId: resolveVoicePreset(args.voicePreset), preset: args.voicePreset };
  }

  // No flag passed → use ELEVENLABS_VOICE_ID (the "default" preset)
  const voiceId = process.env['ELEVENLABS_VOICE_ID'];
  if (!voiceId) {
    console.error('Error: voice ID required — set ELEVENLABS_VOICE_ID in .env, or pass --voice-preset or --voice-id');
    console.error(`  Available presets: ${VALID_PRESETS.join(', ')}`);
    process.exit(1);
  }
  return { voiceId, preset: 'default' };
}
