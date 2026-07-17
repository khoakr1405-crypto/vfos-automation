import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import {
  WORDS_PER_SEC,
  computeWordBudget,
  resolveVoiceProvider,
  wordsPerSecondFor,
} from '../scripts/job-manager/core/pace.ts';

describe('pace: từ/giây theo provider', () => {
  test('edge = 2.5, elevenlabs = 2.1 (chậm hơn)', () => {
    assert.equal(WORDS_PER_SEC.edge, 2.5);
    assert.equal(WORDS_PER_SEC.elevenlabs, 2.1);
    assert.equal(wordsPerSecondFor('edge'), 2.5);
    assert.equal(wordsPerSecondFor('elevenlabs'), 2.1);
  });

  test('elevenlabs đọc chậm hơn edge → wps nhỏ hơn', () => {
    assert.ok(WORDS_PER_SEC.elevenlabs < WORDS_PER_SEC.edge);
  });
});

describe('pace: computeWordBudget', () => {
  test('video 15s (target 13.5s): elevenlabs ít từ hơn edge → chống VOICE_LONGER', () => {
    const target = 13.5;
    const edgeBudget = computeWordBudget(target, 'edge');
    const elevenBudget = computeWordBudget(target, 'elevenlabs');
    assert.equal(edgeBudget, 33); // floor(13.5 * 2.5)
    assert.equal(elevenBudget, 28); // floor(13.5 * 2.1)
    assert.ok(elevenBudget < edgeBudget, 'ElevenLabs phải ít từ hơn edge cùng thời lượng');
  });

  test('làm tròn xuống', () => {
    assert.equal(computeWordBudget(5, 'elevenlabs'), 10); // 5*2.1=10.5 → 10
    assert.equal(computeWordBudget(10, 'edge'), 25);
  });
});

describe('pace: resolveVoiceProvider (env)', () => {
  const original = process.env.VFOS_VOICE_PROVIDER;
  afterEach(() => {
    if (original === undefined) delete process.env.VFOS_VOICE_PROVIDER;
    else process.env.VFOS_VOICE_PROVIDER = original;
  });

  test('mặc định (không set env) → elevenlabs (giọng chính thức)', () => {
    delete process.env.VFOS_VOICE_PROVIDER;
    assert.equal(resolveVoiceProvider(), 'elevenlabs');
  });

  test('VFOS_VOICE_PROVIDER=edge → edge (escape hatch)', () => {
    process.env.VFOS_VOICE_PROVIDER = 'edge';
    assert.equal(resolveVoiceProvider(), 'edge');
  });

  test('giá trị lạ → elevenlabs (chỉ "edge" mới ra edge)', () => {
    process.env.VFOS_VOICE_PROVIDER = 'google';
    assert.equal(resolveVoiceProvider(), 'elevenlabs');
  });
});
