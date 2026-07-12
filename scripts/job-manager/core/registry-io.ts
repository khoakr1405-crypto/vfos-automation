// Job registry IO + entry helpers (extracted from scripts/vfos-job-manager.ts —
// God-file anatomy Nhịp 1). Behavior-preserving verbatim move.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { isoNow } from './manifest-io.js';
import { REGISTRY_PATH } from './paths.js';
import { extractProductName } from './product-card.js';
import type { JobManifest, Registry, RegistryEntry } from './types.js';

export function loadRegistry(): Registry {
  const path = resolve(REGISTRY_PATH);
  if (!existsSync(path)) {
    return { registryVersion: 'v1', updatedAt: isoNow(), jobs: [] };
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Registry;
    if (!raw.registryVersion) raw.registryVersion = 'v1';
    if (!Array.isArray(raw.jobs)) raw.jobs = [];
    return raw;
  } catch {
    console.error(`Warning: registry at ${REGISTRY_PATH} is unreadable; starting fresh in memory.`);
    return { registryVersion: 'v1', updatedAt: isoNow(), jobs: [] };
  }
}

export function saveRegistry(reg: Registry): void {
  const path = resolve(REGISTRY_PATH);
  mkdirSync(dirname(path), { recursive: true });
  reg.updatedAt = isoNow();
  writeFileSync(path, `${JSON.stringify(reg, null, 2)}\n`, 'utf8');
}

export function upsertRegistryEntry(reg: Registry, entry: RegistryEntry): void {
  const idx = reg.jobs.findIndex((j) => j.jobId === entry.jobId);
  if (idx >= 0) {
    reg.jobs[idx] = entry;
  } else {
    reg.jobs.push(entry);
  }
}

export function entryFromManifest(
  manifest: JobManifest,
  productName: string | null,
): RegistryEntry {
  return {
    jobId: manifest.jobId,
    runId: manifest.runId,
    state: manifest.state,
    productName,
    productCardPath: manifest.source.productCardPath,
    sourceVideoPath: manifest.source.sourceVideoPath,
    captionedPreviewPath: manifest.artifacts.captionedPreviewPath,
    operatorDecision: manifest.review.operatorDecision,
    batchId: manifest.batchId ?? null,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
  };
}

/**
 * Cập nhật entry registry theo manifest (partial update — KHÔNG upsert; job chưa
 * có trong registry thì bỏ qua). Behavior-preserving move từ
 * review-video-orchestrator (N1): giữ nguyên field set + early-return.
 */
export function updateRegistryFromManifest(manifest: JobManifest): void {
  const reg = loadRegistry();
  const idx = reg.jobs.findIndex((j) => j.jobId === manifest.jobId);
  if (idx < 0) return;
  const existing = reg.jobs[idx];
  if (!existing) return;
  reg.jobs[idx] = {
    ...existing,
    state: manifest.state,
    sourceVideoPath: manifest.source.sourceVideoPath,
    captionedPreviewPath: manifest.artifacts.captionedPreviewPath,
    operatorDecision: manifest.review.operatorDecision,
    updatedAt: manifest.updatedAt,
  };
  saveRegistry(reg);
}

export function productNameFromManifest(manifest: JobManifest): string | null {
  if (!manifest.source.productCardPath) return null;
  const cardPath = resolve(manifest.source.productCardPath);
  if (!existsSync(cardPath)) return null;
  try {
    const card = JSON.parse(readFileSync(cardPath, 'utf8')) as Record<string, unknown>;
    return extractProductName(card);
  } catch {
    return null;
  }
}
