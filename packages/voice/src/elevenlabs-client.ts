import { writeFile } from 'node:fs/promises';
import type {
  ElevenLabsClientConfig,
  TTSResult,
  TTSTimestampsResult,
  VoiceSettings,
} from './types.js';

const API_BASE = 'https://api.elevenlabs.io/v1';
// eleven_v3: 70+ languages incl. Vietnamese (Tier 3 "Very good"), best expressiveness.
// eleven_multilingual_v2 does NOT support Vietnamese — do not use for VFOS.
const DEFAULT_MODEL = 'eleven_v3';
// eleven_v3 does NOT support the /with-timestamps endpoint; flash_v2_5 DOES and
// still covers Vietnamese — used only as a fallback so caption alignment works.
const TIMESTAMPS_FALLBACK_MODEL = 'eleven_flash_v2_5';

/** True when an error response means "this model can't do this endpoint", so the
 *  caller may retry with the timestamps-capable fallback model. */
function isModelUnsupported(status: number, detail: string): boolean {
  if (status !== 422 && status !== 400) return false;
  const lower = detail.toLowerCase();
  return (
    lower.includes('model') &&
    (lower.includes('not') || lower.includes('unsupported') || lower.includes('invalid'))
  );
}

export class ElevenLabsClient {
  readonly #apiKey: string;
  readonly #voiceId: string;
  readonly #modelId: string;

  constructor(config: ElevenLabsClientConfig) {
    this.#apiKey = config.apiKey;
    this.#voiceId = config.voiceId;
    this.#modelId = config.modelId ?? DEFAULT_MODEL;
  }

  async generate(text: string, settings: VoiceSettings, outputPath: string): Promise<TTSResult> {
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
      throw new Error(`ElevenLabs API error ${response.status} ${response.statusText}: ${detail}`);
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

  /** Synthesize text AND return character-level timing via `/with-timestamps`
   *  (needed for caption sync). Decodes the base64 audio to `outputPath`.
   *  Retries once with the timestamps-capable fallback model if the requested
   *  model (e.g. eleven_v3) doesn't support this endpoint. */
  async generateWithTimestamps(
    text: string,
    settings: VoiceSettings,
    outputPath: string,
  ): Promise<TTSTimestampsResult> {
    const call = async (modelId: string): Promise<Response> => {
      const url = `${API_BASE}/text-to-speech/${this.#voiceId}/with-timestamps`;
      return fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': this.#apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability: settings.stability,
            similarity_boost: settings.similarity_boost,
            style: settings.style,
            use_speaker_boost: true,
            speed: settings.speed,
          },
        }),
      });
    };

    let modelUsed = this.#modelId;
    let response = await call(modelUsed);

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      if (
        this.#modelId !== TIMESTAMPS_FALLBACK_MODEL &&
        isModelUnsupported(response.status, detail)
      ) {
        modelUsed = TIMESTAMPS_FALLBACK_MODEL;
        response = await call(modelUsed);
      } else {
        // Detail never contains the API key (key is header-only); truncate to
        // avoid spilling internals.
        throw new Error(
          `ElevenLabs /with-timestamps error ${response.status} ${response.statusText}: ${detail.slice(0, 300)}`,
        );
      }
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `ElevenLabs /with-timestamps error ${response.status} ${response.statusText}: ${detail.slice(0, 300)}`,
      );
    }

    const data = (await response.json()) as {
      audio_base64?: string;
      alignment?: TTSTimestampsResult['alignment'];
      normalized_alignment?: TTSTimestampsResult['normalized_alignment'];
    };
    if (!data.audio_base64 || !data.alignment) {
      throw new Error('ElevenLabs /with-timestamps returned no audio_base64 or alignment');
    }

    await writeFile(outputPath, Buffer.from(data.audio_base64, 'base64'));

    return {
      audio_path: outputPath,
      character_count: text.length,
      model_used: modelUsed,
      alignment: data.alignment,
      normalized_alignment: data.normalized_alignment ?? data.alignment,
    };
  }
}
