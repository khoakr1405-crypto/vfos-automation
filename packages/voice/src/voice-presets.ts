/**
 * VFOS voice resolver — single brand voice (`ZqE9vIHPcrC35dZv0Svu` + Eleven v3).
 *
 * History: this file used to map `voice_01..voice_05` presets to env vars
 * `ELEVENLABS_VOICE_ID_01..05` so the operator could A/B test multiple voices.
 * As of 2026-05-20 VFOS standardizes on ONE brand voice. The multi-preset map
 * and `--voice-preset` CLI flag are gone. Filename is kept so existing
 * imports in `generate.ts` / `sync.ts` continue to resolve without churn.
 *
 * The `--voice-id <raw>` override stays in place purely as a debug knob —
 * useful when comparing the brand voice against a candidate, never used in
 * `/chay` automation.
 */

export function resolveVoice(args: { voiceId?: string | undefined }): {
  voiceId: string;
  preset: string | null;
} {
  if (args.voiceId) {
    return { voiceId: args.voiceId, preset: null };
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!voiceId) {
    console.error(
      'Error: ELEVENLABS_VOICE_ID is not set. VFOS uses one brand voice; set it in .env',
    );
    console.error('  Example: ELEVENLABS_VOICE_ID=ZqE9vIHPcrC35dZv0Svu');
    process.exit(1);
  }
  return { voiceId, preset: 'vfos_default' };
}
