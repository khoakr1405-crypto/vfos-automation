import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

export interface ScriptArtifact {
  hook?: string;
  hook3s?: string;
  voiceover?: string;
  voiceoverText?: string;
}

export function extractCombinedVoiceText(scriptPath: string): string | null {
  if (!existsSync(scriptPath)) return null;
  try {
    const raw = readFileSync(scriptPath, 'utf8');
    const artifact = JSON.parse(raw) as ScriptArtifact;
    // Align with elevenlabs-voiceover-bridge extraction logic
    const hook = (artifact.hook3s ?? artifact.hook ?? '').trim();
    const voiceover = (artifact.voiceover ?? artifact.voiceoverText ?? '').trim();
    const combined = [hook, voiceover].filter(Boolean).join(' ').trim();
    return combined || null;
  } catch {
    return null;
  }
}

export function calculateNormalizedHash(text: string): string {
  // Normalize whitespace to prevent spaces or newlines from shifting the hash
  const normalized = text.trim().replace(/\s+/g, ' ');
  const hash = createHash('sha256').update(normalized, 'utf8').digest('hex');
  return `sha256:${hash}`;
}
