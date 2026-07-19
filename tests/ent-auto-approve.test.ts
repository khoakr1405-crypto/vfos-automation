import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { EntAutoApproveDeps } from '../apps/studio/src/lib/entertainment/auto-approve.ts';

// tsx interops apps/studio modules inconsistently (named exports land on `.default`
// under `tsx -e` but top-level under `tsx --test`) — documented runner drift; the lib
// itself is fine under Next. Take `.default ?? module` to reach the functions either way.
const _mod = await import('../apps/studio/src/lib/entertainment/auto-approve.ts');
const { entAutoApproveEnabled, shouldAutoApproveEntPreview } = ((
  _mod as { default?: typeof _mod }
).default ?? _mod) as typeof _mod;

// All-green baseline: every guard holds, gate PASSed, not yet approved, enabled.
function deps(over: Partial<EntAutoApproveDeps> = {}): EntAutoApproveDeps {
  return {
    enabled: true,
    verdict: 'PASS',
    scriptApproved: true,
    voiceRenderDone: true,
    previewFileExists: true,
    audioPolicyApplied: true,
    alreadyPreviewApproved: false,
    anyStepRunning: false,
    ...over,
  };
}

describe('shouldAutoApproveEntPreview: fail-closed, mirrors approvePreview guards', () => {
  test('all green + PASS → auto-approve', () => {
    assert.equal(shouldAutoApproveEntPreview(deps()), true);
  });

  test('config off → never', () => {
    assert.equal(shouldAutoApproveEntPreview(deps({ enabled: false })), false);
  });

  test('already approved → no-op (idempotent)', () => {
    assert.equal(shouldAutoApproveEntPreview(deps({ alreadyPreviewApproved: true })), false);
  });

  for (const v of ['FAIL', 'NEEDS_HUMAN', null] as const) {
    test(`verdict ${v} → hold for human`, () => {
      assert.equal(shouldAutoApproveEntPreview(deps({ verdict: v })), false);
    });
  }

  test('any missing guard blocks (audio policy not applied → no auto-approve)', () => {
    assert.equal(shouldAutoApproveEntPreview(deps({ audioPolicyApplied: false })), false);
  });
  test('no preview file → no auto-approve', () => {
    assert.equal(shouldAutoApproveEntPreview(deps({ previewFileExists: false })), false);
  });
  test('script gate not passed → no auto-approve', () => {
    assert.equal(shouldAutoApproveEntPreview(deps({ scriptApproved: false })), false);
  });
  test('a step still running → wait', () => {
    assert.equal(shouldAutoApproveEntPreview(deps({ anyStepRunning: true })), false);
  });
});

describe('entAutoApproveEnabled: default OFF, per-lane override', () => {
  test('nothing set → false', () => {
    assert.equal(entAutoApproveEnabled({}), false);
  });
  test('global on → true', () => {
    assert.equal(entAutoApproveEnabled({ VFOS_AUTO_APPROVE: 'on' }), true);
  });
  test('per-lane ENT off beats global on', () => {
    assert.equal(
      entAutoApproveEnabled({ VFOS_AUTO_APPROVE: 'on', VFOS_AUTO_APPROVE_ENT: 'off' }),
      false,
    );
  });
  test('per-lane ENT on beats global off', () => {
    assert.equal(
      entAutoApproveEnabled({ VFOS_AUTO_APPROVE: 'off', VFOS_AUTO_APPROVE_ENT: 'on' }),
      true,
    );
  });
});
