// Pace SSOT (lane Review) — tốc độ đọc từ/giây theo TTS provider, để word budget
// của bước SCRIPT biết trước giọng sẽ đọc mà ép đúng số từ.
//
// BỐI CẢNH: bước script chạy TRƯỚC bước voice và trước đây dùng cứng 2.5 từ/giây
// bất kể provider. ElevenLabs (giọng chính thức từ Phần 78b) đọc tiếng Việt CHẬM
// hơn edge-tts ~14–18% → cùng số từ ra voiceover DÀI hơn → video ngắn (15s) dễ
// vấp cổng VOICE_LONGER_THAN_VIDEO (duration-gate) SAU KHI đã tốn tiền TTS.
//
// Sửa: chọn từ/giây theo provider. Ước lượng elevenlabs 2.1 (≈2.5×0.84) là THẬN
// TRỌNG — ít từ hơn thì cùng lắm thừa thời lượng, không tràn. Nên hiệu chuẩn lại
// bằng số đo voiceover.mp3 thật của vài job đã render (như packages/script-writer/
// src/quality-guard.ts đã làm cho lane ENT), đừng coi 2.1 là con số cuối cùng.

export type VoiceProvider = 'edge' | 'elevenlabs';

export const WORDS_PER_SEC: Record<VoiceProvider, number> = {
  edge: 2.5,
  elevenlabs: 2.1,
};

// NHÂN BẢN CÓ CHỦ Ý resolveVoiceProvider() của pipeline/steps/voice-gate.ts:20.
// File voice-gate.ts đang dirty (batch ElevenLabs chưa commit) nên KHÔNG extract
// từ đó lúc này để tránh đụng công việc dở; voice-gate adopt SSOT này ở round sau.
// Hai bản phải khớp logic: chỉ 'edge' khi env == 'edge', còn lại 'elevenlabs'.
export function resolveVoiceProvider(): VoiceProvider {
  return process.env.VFOS_VOICE_PROVIDER === 'edge' ? 'edge' : 'elevenlabs';
}

export function wordsPerSecondFor(provider: VoiceProvider): number {
  return WORDS_PER_SEC[provider];
}

/** Số từ mục tiêu cho lời thoại theo thời lượng + provider (làm tròn xuống). */
export function computeWordBudget(targetVoiceDurationSec: number, provider: VoiceProvider): number {
  return Math.floor(targetVoiceDurationSec * wordsPerSecondFor(provider));
}
