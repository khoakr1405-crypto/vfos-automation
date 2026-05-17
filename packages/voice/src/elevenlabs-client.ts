import { writeFile } from 'node:fs/promises';
import type { ElevenLabsClientConfig, TTSResult, VoiceSettings } from './types.js';

const API_BASE = 'https://api.elevenlabs.io/v1';
// eleven_v3: 70+ languages incl. Vietnamese (Tier 3 "Very good"), best expressiveness.
// eleven_multilingual_v2 does NOT support Vietnamese — do not use for VFOS.
const DEFAULT_MODEL = 'eleven_v3';

export class ElevenLabsClient {
  readonly #apiKey: string;
  readonly #voiceId: string;
  readonly #modelId: string;

  constructor(config: ElevenLabsClientConfig) {
    this.#apiKey = config.apiKey;
    this.#voiceId = config.voiceId;
    this.#modelId = config.modelId ?? DEFAULT_MODEL;
  }

  async generate(
    text: string,
    settings: VoiceSettings,
    outputPath: string,
  ): Promise<TTSResult> {
    const url = `${API_BASE}/text-to-speech/${this.#voiceId}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.#apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: this.#modelId,
        voice_settings: {
          stability: settings.stability,
          similarity_boost: settings.similarity_boost,
          style: settings.style,
          use_speaker_boost: true,
          speed: settings.speed,
        },
      }),
    });

    if (!response.ok) {
      let detail = '';
      try {
        detail = await response.text();
      } catch {
        // ignore
      }
      throw new Error(
        `ElevenLabs API error ${response.status} ${response.statusText}: ${detail}`,
      );
    }

    if (!response.body) {
      throw new Error('ElevenLabs API returned empty response body');
    }

    const audioBuffer = await response.arrayBuffer();
    await writeFile(outputPath, new Uint8Array(audioBuffer));

    return {
      audio_path: outputPath,
      character_count: text.length,
    };
  }
}
