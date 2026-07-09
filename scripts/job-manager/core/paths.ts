// Shared path/constant hub for the VFOS job-manager (extracted from
// scripts/vfos-job-manager.ts — God-file anatomy Nhịp 1). Runtime data lives
// under data/ which is gitignored.

export const JOBS_ROOT = 'data/temp/jobs';
export const REGISTRY_PATH = 'data/temp/vfos_jobs_registry.json';
export const CHANNELS_CONFIG_PATH = 'config/channels.json';
export const NICHES_CONFIG_PATH = 'config/niches.json';
// Lane mặc định khi chưa có niche active nào trong config/niches.json — giữ hành vi
// cũ (behavior-preserving), không vỡ khi registry ngách rỗng/thiếu.
export const FALLBACK_LANE = 'product-review';

// Default local-only inbox where the Operator drops downloaded/selected source
// videos. The whole `data/` tree is gitignored, so videos here never commit.
export const OPERATOR_VIDEO_INBOX = 'data/operator/video-downloads';

export const VALID_VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.m4v']);
