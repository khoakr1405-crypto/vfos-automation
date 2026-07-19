// Raw-fetch OpenAI helpers for the entertainment-lane E1 scripts.
// Uses plain fetch (same approach as scripts/job-final-qa-gate.ts) instead of
// the OpenAI SDK, so the scripts/ tree needs no package resolution. Two calls:
//   - transcribeZh: Whisper STT of Chinese source audio with segment timestamps
//   - chatJson: gpt-4o JSON-mode completion (clip-mining + transcreation)
import { readFileSync } from 'node:fs';

const TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
const CHAT_URL = 'https://api.openai.com/v1/chat/completions';

/** gpt-5.x / o-series are reasoning models: on chat/completions they reject a
 *  custom `temperature` (HTTP 400 unsupported_value — only the default 1 is
 *  allowed). Callers keep passing temperature; we just omit it for these. */
export function isReasoningModel(id: string): boolean {
  return /^(gpt-5|o1|o3|o4)/.test(id);
}

export interface AsrSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface AsrResult {
  language: string;
  durationSec: number;
  text: string;
  segments: AsrSegment[];
}

/** Transcribe an audio file via whisper-1 with segment-level timing, in `lang`
 *  (ISO code — 'zh' for Chinese source, 'vi' for the Vietnamese voiceover QA). */
export async function transcribe(
  apiKey: string,
  audioPath: string,
  lang: string,
): Promise<AsrResult> {
  const buf = readFileSync(audioPath);
  const blob = new Blob([buf], { type: 'audio/mp3' });
  const form = new FormData();
  form.append('file', blob, 'audio.mp3');
  form.append('model', 'whisper-1');
  form.append('language', lang);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');

  const res = await fetch(TRANSCRIBE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`OPENAI_TRANSCRIBE_FAILURE: HTTP ${res.status} — ${await res.text()}`);
  }
  const json = (await res.json()) as {
    language?: string;
    duration?: number;
    text?: string;
    segments?: Array<{ id: number; start: number; end: number; text: string }>;
  };
  const segments: AsrSegment[] = (json.segments ?? []).map((s) => ({
    id: s.id,
    start: s.start,
    end: s.end,
    text: (s.text ?? '').trim(),
  }));
  return {
    language: json.language ?? lang,
    durationSec: json.duration ?? 0,
    text: (json.text ?? '').trim(),
    segments,
  };
}

/** Transcribe a (Chinese) audio file via whisper-1 — thin wrapper over transcribe(…,'zh'). */
export async function transcribeZh(apiKey: string, audioPath: string): Promise<AsrResult> {
  return transcribe(apiKey, audioPath, 'zh');
}

/** gpt-4o JSON-mode completion. Returns parsed JSON of type T. */
export async function chatJson<T>(
  apiKey: string,
  opts: { model?: string; system: string; user: string; temperature?: number },
): Promise<T> {
  const model = opts.model ?? 'gpt-4o';
  const payload: Record<string, unknown> = {
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
  };
  if (!isReasoningModel(model)) payload.temperature = opts.temperature ?? 0.4;
  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`OPENAI_CHAT_FAILURE: HTTP ${res.status} — ${await res.text()}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('OPENAI_CHAT_EMPTY: no content returned');
  return JSON.parse(content) as T;
}

/** gpt-4o VISION JSON completion — scores a batch of labeled frames.
 *  Uses detail:'low' (≈85 tokens/image) to keep cost small. */
export async function chatVisionJson<T>(
  apiKey: string,
  opts: {
    model?: string;
    system: string;
    userText: string;
    images: Array<{ label: string; base64: string }>;
    temperature?: number;
  },
): Promise<T> {
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: opts.userText }];
  for (const img of opts.images) {
    content.push({ type: 'text', text: `frame ${img.label}:` });
    content.push({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${img.base64}`, detail: 'low' },
    });
  }
  const model = opts.model ?? 'gpt-4o';
  const payload: Record<string, unknown> = {
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content },
    ],
  };
  if (!isReasoningModel(model)) payload.temperature = opts.temperature ?? 0.2;
  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`OPENAI_VISION_FAILURE: HTTP ${res.status} — ${await res.text()}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const out = json.choices?.[0]?.message?.content;
  if (!out) throw new Error('OPENAI_VISION_EMPTY: no content returned');
  return JSON.parse(out) as T;
}
