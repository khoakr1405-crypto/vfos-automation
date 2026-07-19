/* =============================================================================
 * VFOS — Publish DISCOVERY core (Phần 82, R-B) — PURE decisions từ JSON đã parse.
 * -----------------------------------------------------------------------------
 * Máy tick (publish-rhythm-tick.ts) đọc file JSON THẲNG từ đĩa (KHÔNG import @/
 * alias — không tsx nào resolve được), rồi dùng các hàm THUẦN dưới đây để quyết
 * định: job này đã DUYỆT chưa, caption là gì, video ở đâu, đã đăng chưa. Tách khỏi
 * I/O để test vàng không cần server/token.
 *
 * QUAN TRỌNG (từ recon R-B):
 *  - Review: cổng duyệt = manifest.review.operatorDecision==='APPROVED' (KHÔNG phải
 *    manifest.state — state bị reset 'READY_FOR_OPERATOR_REVIEW' mỗi lần re-render).
 *    'AUTO_APPROVED' KHÔNG phải JobState; auto-approve ghi operatorDecision='APPROVED'.
 *  - ENT: reviewGates.previewApproved có thể STALE=false với job auto-approve (chỉ
 *    flip trong getJobDetail reconcile @/-poisoned). Nên PHẢI recompute từ đĩa.
 *  - ENT mis-post: BẮT BUỘC accountId tường minh trong ent_job.json; thiếu → SKIP,
 *    TUYỆT ĐỐI KHÔNG suy account theo niche trong tick.
 *  - Máy tick KHÔNG resolve token / KHÔNG gọi API nền tảng — chỉ phát hiện job sẵn
 *    sàng rồi giao jobId cho route Studio (guard G4/G7 chạy server-side).
 * ========================================================================== */

/* ── REVIEW lane ─────────────────────────────────────────────────────────── */

export interface ReviewManifestLike {
  review?: { operatorDecision?: unknown } | null;
  artifacts?: { captionedPreviewPath?: unknown; previewVideoPath?: unknown } | null;
  state?: unknown;
}
export interface ReviewRegistryEntryLike {
  operatorDecision?: unknown;
  captionedPreviewPath?: unknown;
}

/** operatorDecision hiệu lực (manifest trước, registry sau, mặc định PENDING). */
export function reviewOperatorDecision(
  manifest: ReviewManifestLike | null,
  entry: ReviewRegistryEntryLike | null,
): string {
  const m = manifest?.review?.operatorDecision;
  if (typeof m === 'string' && m) return m;
  const e = entry?.operatorDecision;
  if (typeof e === 'string' && e) return e;
  return 'PENDING';
}

export function isReviewApproved(
  manifest: ReviewManifestLike | null,
  entry: ReviewRegistryEntryLike | null,
): boolean {
  return reviewOperatorDecision(manifest, entry) === 'APPROVED';
}

/** Đã đăng TikTok rồi? (tiktok_publish_status.json.status==='POSTED'). */
export function isReviewAlreadyPosted(status: { status?: unknown } | null): boolean {
  return status?.status === 'POSTED';
}

/**
 * Rel path video final của job Review: captionedPreviewPath → registry
 * captionedPreviewPath → previewVideoPath; PHẢI kết thúc .mp4. Kiểm tra tồn tại/
 * inside-repo là việc của tầng I/O.
 */
export function resolveReviewVideoRel(
  manifest: ReviewManifestLike | null,
  entry: ReviewRegistryEntryLike | null,
): string | null {
  const candidates = [
    manifest?.artifacts?.captionedPreviewPath,
    entry?.captionedPreviewPath,
    manifest?.artifacts?.previewVideoPath,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().toLowerCase().endsWith('.mp4')) return c.trim();
  }
  return null;
}

/**
 * Caption tự động cho video thuần Review — replicate getReviewCaptionDraft:
 * base = (captionDraft||hook).trim(); rỗng → null; nối các #hashtag chưa có trong
 * base; cắt 2000. KHÔNG chèn affiliate (video thuần).
 */
export function resolveReviewCaption(
  art: { captionDraft?: unknown; hook?: unknown; hashtags?: unknown } | null,
): string | null {
  const draft = typeof art?.captionDraft === 'string' ? art.captionDraft.trim() : '';
  const hook = typeof art?.hook === 'string' ? art.hook.trim() : '';
  const base = draft || hook;
  if (!base) return null;
  const tags = Array.isArray(art?.hashtags)
    ? (art.hashtags as unknown[]).filter(
        (t): t is string => typeof t === 'string' && t.startsWith('#'),
      )
    : [];
  const missing = tags.filter((t) => !base.includes(t));
  return [base, missing.join(' ')].filter(Boolean).join('\n').trim().slice(0, 2000);
}

/* ── ENT lane ────────────────────────────────────────────────────────────── */

export interface EntReadinessDeps {
  autoApproveEnabled: boolean;
  /** auto_approve_report.json.verdict; null nếu thiếu/hỏng report. */
  verdict: 'PASS' | 'FAIL' | 'NEEDS_HUMAN' | null;
  /** ent_job.json.reviewGates.previewApproved (có thể STALE=false cho job auto). */
  manifestPreviewApproved: boolean;
  scriptApproved: boolean;
  voiceRenderDone: boolean;
  previewFileExists: boolean;
  audioPolicyApplied: boolean;
  anyStepRunning: boolean;
}

/**
 * ENT preview đã SẴN SÀNG để đăng chưa? Fail-closed:
 *  - đang có step chạy hoặc chưa có file preview → false (không đăng giữa render).
 *  - manual GATE2 (previewApproved===true) đáng tin (approvePreview đã ép đủ guard) →
 *    true khi script cũng đã duyệt.
 *  - nhánh AUTO: previewApproved có thể stale-false → recompute; cần enabled + verdict
 *    PASS + script/voice/audio guard. Mirror shouldAutoApproveEntPreview (auto-approve.ts)
 *    nhưng trả lời câu hỏi "ĐĂNG ĐƯỢC CHƯA" (không phải "có nên flip gate không").
 *    Giữ ĐỒNG BỘ với auto-approve.ts nếu sửa luật.
 */
export function entPreviewReadyToPublish(d: EntReadinessDeps): boolean {
  if (d.anyStepRunning) return false;
  if (!d.previewFileExists) return false;
  if (d.manifestPreviewApproved && d.scriptApproved) return true;
  if (!d.autoApproveEnabled) return false;
  return d.verdict === 'PASS' && d.scriptApproved && d.voiceRenderDone && d.audioPolicyApplied;
}

/** Caption ENT lấy từ montage_v2/package.json.caption (đã có thể operator-edit). */
export function resolveEntCaption(pkg: { caption?: unknown } | null): string | null {
  const c = typeof pkg?.caption === 'string' ? pkg.caption.trim() : '';
  return c || null;
}

/**
 * accountId đích BẮT BUỘC tường minh (mis-post key). Thiếu → null → tick SKIP.
 * KHÔNG suy theo niche (fallback đó chỉ an toàn trong jobs.ts có channels registry).
 */
export function requireEntAccountId(manifest: { accountId?: unknown } | null): string | null {
  const a = typeof manifest?.accountId === 'string' ? manifest.accountId.trim() : '';
  return a || null;
}

/** Đã đăng (ENT tiktok/facebook summary status POSTED)? */
export function isEntAlreadyPosted(
  manifest: {
    tiktok?: { status?: unknown } | null;
    facebook?: { status?: unknown } | null;
  } | null,
): boolean {
  const tt = manifest?.tiktok?.status;
  const fb = manifest?.facebook?.status;
  return tt === 'TIKTOK_POSTED' || tt === 'POSTED' || fb === 'POSTED' || fb === 'PUBLISHED';
}
