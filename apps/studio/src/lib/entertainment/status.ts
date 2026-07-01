/* =============================================================================
 * VFOS Studio — Entertainment lane STATUS projection (PR-B) — SERVER ONLY
 * -----------------------------------------------------------------------------
 * Read-only projection cho Entertainment Status panel ở màn Tổng quan. Thay logic
 * slash command `/ent-status` bằng nguồn dữ liệu THẬT: đọc thẳng manifest qua
 * listJobs() (PURE READ — KHÔNG reconcile, KHÔNG ghi) nên tương đương chính xác
 * nguồn `ent_job.json` mà /ent-status đọc.
 *
 * KHÔNG dùng getJobDetail() vì hàm đó reconcile + writeManifest (side-effect) —
 * vi phạm read-only. KHÔNG đụng pipeline/render/BGM/blur. Chỉ project field sẵn có.
 * ========================================================================== */

import { type EntJob, listJobs } from './jobs';

/** DTO tối giản cho Entertainment Status panel — mirror cột của /ent-status. */
export interface EntJobStatusUi {
  jobId: string;
  state: string;
  channelId: string | null;
  accountId: string | null;
  channelNiche: string | null;
  niche: string | null;
  scriptApproved: boolean | null;
  previewApproved: boolean | null;
  scriptReviewStatus: string | null;
  renderVerdict: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

function project(j: EntJob): EntJobStatusUi {
  return {
    jobId: j.jobId,
    state: j.state,
    channelId: j.channelId ?? null,
    accountId: j.accountId ?? null,
    channelNiche: j.channelNiche ?? null,
    niche: j.niche ?? null,
    scriptApproved: j.reviewGates?.scriptApproved ?? null,
    previewApproved: j.reviewGates?.previewApproved ?? null,
    scriptReviewStatus: j.script?.reviewStatus ?? null,
    renderVerdict: j.render?.verdict ?? null,
    createdAt: j.createdAt ?? null,
    updatedAt: j.updatedAt ?? null,
  };
}

/** Danh sách trạng thái job Entertainment cho panel (read-only). Thiếu field → null → UI hiện `—`. */
export function listEntStatusForUi(): EntJobStatusUi[] {
  return listJobs().map(project);
}
