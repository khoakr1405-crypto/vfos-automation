import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  type EntReadinessDeps,
  entPreviewReadyToPublish,
  isEntAlreadyPosted,
  isReviewAlreadyPosted,
  isReviewApproved,
  requireEntAccountId,
  resolveEntCaption,
  resolveReviewCaption,
  resolveReviewVideoRel,
  reviewOperatorDecision,
} from '../scripts/job-manager/core/publish-discovery.ts';

describe('REVIEW: operatorDecision là cổng duyệt (KHÔNG phải state)', () => {
  test('manifest thắng registry', () => {
    assert.equal(
      reviewOperatorDecision(
        { review: { operatorDecision: 'APPROVED' } },
        { operatorDecision: 'PENDING' },
      ),
      'APPROVED',
    );
  });
  test('rơi về registry khi manifest thiếu', () => {
    assert.equal(reviewOperatorDecision({}, { operatorDecision: 'APPROVED' }), 'APPROVED');
  });
  test('mặc định PENDING', () => {
    assert.equal(reviewOperatorDecision(null, null), 'PENDING');
  });
  test('isReviewApproved chỉ true khi APPROVED (state=READY vẫn approve được)', () => {
    assert.equal(
      isReviewApproved(
        { state: 'READY_FOR_OPERATOR_REVIEW', review: { operatorDecision: 'APPROVED' } },
        null,
      ),
      true,
    );
    assert.equal(isReviewApproved({ review: { operatorDecision: 'REJECTED' } }, null), false);
  });
});

describe('REVIEW: đã đăng / video path', () => {
  test('isReviewAlreadyPosted', () => {
    assert.equal(isReviewAlreadyPosted({ status: 'POSTED' }), true);
    assert.equal(isReviewAlreadyPosted({ status: 'FAILED' }), false);
    assert.equal(isReviewAlreadyPosted(null), false);
  });
  test('resolveReviewVideoRel: ưu tiên captioned, chỉ nhận .mp4', () => {
    assert.equal(
      resolveReviewVideoRel(
        { artifacts: { captionedPreviewPath: 'data/temp/jobs/j/preview_with_captions_v2.mp4' } },
        null,
      ),
      'data/temp/jobs/j/preview_with_captions_v2.mp4',
    );
    // captioned không phải mp4 → rơi về previewVideoPath
    assert.equal(
      resolveReviewVideoRel(
        {
          artifacts: {
            captionedPreviewPath: 'data/temp/jobs/j/x.txt',
            previewVideoPath: 'data/temp/jobs/j/preview.mp4',
          },
        },
        null,
      ),
      'data/temp/jobs/j/preview.mp4',
    );
    assert.equal(resolveReviewVideoRel({ artifacts: {} }, null), null);
  });
});

describe('REVIEW: caption tự động', () => {
  test('captionDraft + hashtag thiếu được nối', () => {
    const c = resolveReviewCaption({ captionDraft: 'Mẹo bếp hay', hashtags: ['#bep', '#review'] });
    assert.equal(c, 'Mẹo bếp hay\n#bep #review');
  });
  test('hashtag đã có trong base không nối lại', () => {
    const c = resolveReviewCaption({ captionDraft: 'Xem ngay #bep', hashtags: ['#bep'] });
    assert.equal(c, 'Xem ngay #bep');
  });
  test('rỗng → null; fallback hook', () => {
    assert.equal(resolveReviewCaption({ captionDraft: '', hook: '' }), null);
    assert.equal(resolveReviewCaption({ hook: 'Hook nè' }), 'Hook nè');
    assert.equal(resolveReviewCaption(null), null);
  });
  test('cắt 2000 ký tự', () => {
    const long = 'a'.repeat(2500);
    assert.equal(resolveReviewCaption({ captionDraft: long })?.length, 2000);
  });
});

describe('ENT: entPreviewReadyToPublish — fail-closed', () => {
  function deps(over: Partial<EntReadinessDeps> = {}): EntReadinessDeps {
    return {
      autoApproveEnabled: true,
      verdict: 'PASS',
      manifestPreviewApproved: false,
      scriptApproved: true,
      voiceRenderDone: true,
      previewFileExists: true,
      audioPolicyApplied: true,
      anyStepRunning: false,
      ...over,
    };
  }
  test('auto PASS + đủ guard → ready', () => {
    assert.equal(entPreviewReadyToPublish(deps()), true);
  });
  test('đang render → không đăng', () => {
    assert.equal(entPreviewReadyToPublish(deps({ anyStepRunning: true })), false);
  });
  test('thiếu file preview → không đăng', () => {
    assert.equal(entPreviewReadyToPublish(deps({ previewFileExists: false })), false);
  });
  test('manual GATE2 (previewApproved=true) tin được kể cả auto tắt', () => {
    assert.equal(
      entPreviewReadyToPublish(
        deps({ manifestPreviewApproved: true, autoApproveEnabled: false, verdict: null }),
      ),
      true,
    );
  });
  test('auto tắt + previewApproved stale-false → KHÔNG đăng', () => {
    assert.equal(entPreviewReadyToPublish(deps({ autoApproveEnabled: false })), false);
  });
  for (const v of ['FAIL', 'NEEDS_HUMAN', null] as const) {
    test(`verdict ${v} + auto → không đăng`, () => {
      assert.equal(entPreviewReadyToPublish(deps({ verdict: v })), false);
    });
  }
  test('auto nhưng thiếu audioPolicy → không đăng', () => {
    assert.equal(entPreviewReadyToPublish(deps({ audioPolicyApplied: false })), false);
  });
});

describe('ENT: caption / accountId mis-post / posted', () => {
  test('resolveEntCaption từ package.json', () => {
    assert.equal(resolveEntCaption({ caption: '  Cá to  ' }), 'Cá to');
    assert.equal(resolveEntCaption({ caption: '' }), null);
    assert.equal(resolveEntCaption(null), null);
  });
  test('requireEntAccountId: thiếu → null (SKIP, KHÔNG suy niche)', () => {
    assert.equal(requireEntAccountId({ accountId: 'tt_fishing_main' }), 'tt_fishing_main');
    assert.equal(requireEntAccountId({}), null);
    assert.equal(requireEntAccountId({ accountId: '  ' }), null);
  });
  test('isEntAlreadyPosted nhận cả tiktok & facebook', () => {
    assert.equal(isEntAlreadyPosted({ tiktok: { status: 'TIKTOK_POSTED' } }), true);
    assert.equal(isEntAlreadyPosted({ facebook: { status: 'PUBLISHED' } }), true);
    assert.equal(isEntAlreadyPosted({ tiktok: { status: 'TIKTOK_FAILED' } }), false);
    assert.equal(isEntAlreadyPosted(null), false);
  });
});
