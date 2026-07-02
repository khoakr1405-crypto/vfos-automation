'use client';

import type {
  GateCheckError,
  GateCheckItem,
  GateCheckResult,
  GateCheckStatus,
} from '@/lib/gate-check/build-gate-check';
import { useState } from 'react';

/**
 * GateCheckButton — nút "Kiểm tra gate" per-job + modal (PR-D). READ-ONLY.
 *
 * Thay logic slash command `/gate-check` trên UI: bấm → gọi GET route PR-C
 * /api/studio/jobs/[jobId]/gate-check (read-only) → hiện overallStatus + 5 gate.
 * Mỗi nút tự quản state (open/loading/data/error); KHÔNG lift state lên panel.
 * Chỉ fetch theo click từng job — KHÔNG auto-run hàng loạt, KHÔNG POST/mutate.
 *
 * Type dùng type-only import từ PR-C lib (erase-at-compile, KHÔNG kéo server code
 * vào client bundle — đúng precedent panel status PR-B).
 */

const STATUS_BADGE: Record<GateCheckStatus, string> = {
  PASS: 'text-accent-green border-accent-green/40 bg-accent-green/10',
  FAIL: 'text-accent-rose border-accent-rose/40 bg-accent-rose/10',
  BLOCKED: 'text-accent-rose border-accent-rose/40 bg-accent-rose/10',
  PENDING: 'text-accent-amber border-accent-amber/40 bg-accent-amber/10',
  MISSING: 'text-neutral-400 border-hairline bg-raised/40',
  UNKNOWN: 'text-neutral-400 border-hairline bg-raised/40',
};

// Map error code (ok:false) → câu tiếng Việt. Ngoài danh sách → fallback chung.
const ERROR_MESSAGE: Record<string, string> = {
  INVALID_JOB_ID: 'Job ID không hợp lệ.',
  UNSUPPORTED_JOB_ID_PREFIX: 'Prefix job không hỗ trợ (chỉ job_* hoặc ent_*).',
  JOB_NOT_FOUND: 'Không tìm thấy job.',
};

const DASH = '—';

function StatusBadge({ status }: { status: GateCheckStatus }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[status]}`}
    >
      {status}
    </span>
  );
}

export function GateCheckButton({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<GateCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runCheck() {
    setOpen(true);
    setLoading(true);
    setData(null);
    setError(null);
    try {
      const res = await fetch(`/api/studio/jobs/${encodeURIComponent(jobId)}/gate-check`);
      const body = (await res.json()) as GateCheckResult | GateCheckError;
      if (body.ok === true) {
        setData(body);
      } else {
        setError(ERROR_MESSAGE[body.code] ?? 'Không kiểm tra được gate.');
      }
    } catch {
      setError('Không kiểm tra được gate.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={runCheck}
        className="rounded-full border border-hairline bg-raised/40 px-2 py-0.5 text-[10px] font-medium text-neutral-300 hover:bg-raised hover:text-neutral-100"
      >
        Kiểm tra gate
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-hairline bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-hairline pb-3">
              <div className="flex items-center gap-2">
                <h4 className="font-mono text-sm font-semibold text-neutral-100">{jobId}</h4>
                {data && (
                  <span className="rounded-full border border-hairline bg-raised/40 px-2 py-0.5 text-[10px] text-neutral-400">
                    {data.lane}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-neutral-400 hover:text-neutral-200"
              >
                Đóng
              </button>
            </div>

            <div className="pt-4">
              {loading ? (
                <p className="text-xs text-neutral-500">Đang kiểm tra gate…</p>
              ) : error ? (
                <p className="text-xs text-accent-rose">{error}</p>
              ) : data ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-neutral-400">
                    <span>
                      state: <strong className="text-neutral-200">{data.state ?? DASH}</strong>
                    </span>
                    <span className="flex items-center gap-1">
                      overall: <StatusBadge status={data.overallStatus} />
                    </span>
                    <span>
                      isPassing:{' '}
                      <strong className={data.isPassing ? 'text-accent-green' : 'text-neutral-300'}>
                        {String(data.isPassing)}
                      </strong>
                    </span>
                    {data.updatedAt && (
                      <span>
                        updatedAt: <span className="font-mono">{data.updatedAt}</span>
                      </span>
                    )}
                  </div>

                  {data.blocker && (
                    <p className="rounded-lg border border-accent-rose/30 bg-accent-rose/10 px-3 py-2 font-mono text-[11px] text-accent-rose">
                      ⛔ {data.blocker}
                    </p>
                  )}

                  <ul className="space-y-2">
                    {data.gates.map((g: GateCheckItem) => (
                      <li
                        key={g.key}
                        className="rounded-lg border border-hairline/60 bg-raised/20 px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] font-medium text-neutral-200">
                            {g.label}
                          </span>
                          <StatusBadge status={g.status} />
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">
                          {g.reason}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
