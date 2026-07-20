'use client';

import { UtilIcon } from '@/components/icons';
import { PanelBadge, PanelShell } from '@/components/overview/panel-shell';
import type { PublishBoardSlotUi, PublishBoardUi } from '@/lib/growth-data/publish-board';
import { useEffect, useState } from 'react';

/**
 * Publish Rhythm Board — READ-ONLY (Phần 82 R-C). Giám sát máy tick tự đăng ở
 * màn Tổng quan: trạng thái cấu hình (master/dry-run/live), phanh tổng, độ trễ
 * tick, slot sắp bắn + đã bắn/bỏ + lý do, todo hậu-kiểm. Fetch GET
 * /api/studio/publish-board (đọc publish-board.json máy tick ghi).
 *
 * Ràng buộc (VFOS_UI_INTEGRATION_GUARDRAIL_V1): display-only, KHÔNG nút action,
 * KHÔNG mutate, KHÔNG gọi tick/publish. board=null → "tick chưa chạy".
 */

const DASH = '—';

/** ISO (UTC) → giờ VIỆT NAM "MM-DD HH:MM" (+07:00). Slot là giờ vàng VN nên phải
 *  hiện giờ VN, KHÔNG để UTC gây hiểu nhầm (11:30 VN ≠ 04:30). */
function fmtTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const vn = new Date(ms + 7 * 60 * 60 * 1000).toISOString();
  return `${vn.slice(5, 10)} ${vn.slice(11, 16)}`;
}

function slotStateChip(s: PublishBoardSlotUi['state']): { label: string; cls: string } {
  switch (s) {
    case 'FIRED':
      return { label: 'ĐÃ BẮN', cls: 'text-accent-green' };
    case 'SKIPPED':
      return { label: 'BỎ QUA', cls: 'text-accent-rose' };
    case 'BOUND':
      return { label: 'ĐÃ GẮN', cls: 'text-accent-amber' };
    default:
      return { label: 'TRỐNG', cls: 'text-neutral-500' };
  }
}

function ConfigChip({ on, label, onCls }: { on: boolean; label: string; onCls: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
        on ? onCls : 'border-hairline bg-raised/20 text-neutral-500'
      }`}
    >
      {label}: {on ? 'ON' : 'off'}
    </span>
  );
}

export function PublishRhythmBoard() {
  const [board, setBoard] = useState<PublishBoardUi | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/studio/publish-board');
        const data = await res.json();
        if (!alive) return;
        if (data.ok === true) {
          setBoard(data.board ?? null);
        } else {
          setNotice('Không lấy được board tự đăng.');
        }
      } catch {
        if (alive) setNotice('Không tải được board tự đăng.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const stale = board?.staleMinutes != null && board.staleMinutes > 10;

  return (
    <PanelShell
      accent="cyan"
      title="Nhịp tự đăng — Auto-Publish (Phần 82)"
      subtitle="Chỉ đọc — máy tick tự đăng theo lịch giờ vàng. Mặc định TẮT (dry-run)."
      right={
        board ? (
          <PanelBadge>
            {board.config.dryRun ? (
              <span className="text-accent-amber">DRY-RUN</span>
            ) : (
              <span className="text-accent-green">LIVE</span>
            )}
          </PanelBadge>
        ) : null
      }
    >
      {loading ? (
        <div className="space-y-2">
          <div className="h-6 w-40 animate-pulse rounded-md bg-raised/25" aria-hidden />
          <div className="h-8 animate-pulse rounded-md bg-raised/15" aria-hidden />
          <span className="sr-only">Đang tải board tự đăng…</span>
        </div>
      ) : notice ? (
        <p className="rounded-lg border border-accent-amber/25 bg-accent-amber/5 px-3 py-2 text-xs text-accent-amber">
          {notice}
        </p>
      ) : !board ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-hairline bg-raised/30 text-neutral-600">
            <UtilIcon name="clock" width={15} height={15} />
          </span>
          <p className="text-xs text-neutral-500">
            Máy tick chưa chạy lần nào — chạy{' '}
            <code className="text-neutral-400">pnpm tick:publish</code> để tạo nhịp.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Hàng trạng thái: cấu hình + phanh + độ trễ tick. */}
          <div className="flex flex-wrap items-center gap-2">
            <ConfigChip
              on={board.config.master}
              label="TICK"
              onCls="border-accent-green/30 bg-accent-green/10 text-accent-green"
            />
            <ConfigChip
              on={board.config.liveTiktok}
              label="TikTok LIVE"
              onCls="border-accent-rose/30 bg-accent-rose/10 text-accent-rose"
            />
            <ConfigChip
              on={board.config.liveFacebook}
              label="FB LIVE"
              onCls="border-accent-rose/30 bg-accent-rose/10 text-accent-rose"
            />
            {board.halted && (
              <span className="inline-flex items-center gap-1 rounded-md border border-accent-rose/40 bg-accent-rose/15 px-2 py-0.5 text-[10px] font-bold text-accent-rose">
                <UtilIcon name="x" width={11} height={11} /> ĐÃ PHANH (HALT)
              </span>
            )}
            <span
              className={`ml-auto font-mono text-[10px] tabular-nums ${stale ? 'text-accent-rose' : 'text-neutral-500'}`}
            >
              tick: {fmtTime(board.lastTickAt)}
              {board.staleMinutes != null &&
                ` (${board.staleMinutes}′ trước${stale ? ' ⚠ treo?' : ''})`}
            </span>
          </div>

          {/* Slot sắp bắn. */}
          {board.upcoming.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                Slot sắp tới{' '}
                <span className="font-normal normal-case text-neutral-700">(giờ VN)</span>
              </p>
              <ul className="space-y-1">
                {board.upcoming.slice(0, 6).map((s) => {
                  const chip = slotStateChip(s.state);
                  return (
                    <li
                      key={s.slotId}
                      className="flex items-center gap-2 border-b border-hairline/30 py-1 text-[11px] text-neutral-300 last:border-0"
                    >
                      <span className="font-mono tabular-nums text-neutral-500">
                        {fmtTime(s.scheduledAt)}
                      </span>
                      <span className="text-neutral-600">·</span>
                      <span className="text-neutral-400">{s.targetId}</span>
                      <span className={`ml-auto font-semibold ${chip.cls}`}>{chip.label}</span>
                      {s.jobId && (
                        <span className="font-mono text-[10px] text-neutral-500">{s.jobId}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Đã bắn / bỏ qua gần đây + lý do. */}
          {board.recent.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                Gần đây
              </p>
              <ul className="space-y-1">
                {board.recent.slice(0, 6).map((s) => {
                  const chip = slotStateChip(s.state);
                  return (
                    <li
                      key={s.slotId}
                      className="flex items-center gap-2 border-b border-hairline/30 py-1 text-[11px] text-neutral-300 last:border-0"
                    >
                      <span className="font-mono tabular-nums text-neutral-500">
                        {fmtTime(s.firedAt ?? s.skippedAt)}
                      </span>
                      <span className="text-neutral-600">·</span>
                      <span className="text-neutral-400">{s.targetId}</span>
                      <span className={`font-semibold ${chip.cls}`}>{chip.label}</span>
                      {s.error && (
                        <span
                          className="ml-auto truncate text-[10px] text-accent-rose"
                          title={s.error.message}
                        >
                          {s.error.code}
                        </span>
                      )}
                      {s.result?.shareUrl && (
                        <span className="ml-auto truncate font-mono text-[10px] text-accent-green">
                          {s.result.postId ?? 'posted'}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Todo hậu-kiểm (mô hình hậu kiểm — xem trên nền tảng sau khi đăng). */}
          {board.operatorTodos.length > 0 && (
            <div className="rounded-lg border border-accent-amber/20 bg-accent-amber/5 px-3 py-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-accent-amber">
                Hậu-kiểm của Operator
              </p>
              <ul className="space-y-0.5 text-[11px] text-neutral-400">
                {board.operatorTodos.map((t) => (
                  <li key={t} className="flex gap-1.5">
                    <span className="text-accent-amber">•</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </PanelShell>
  );
}
