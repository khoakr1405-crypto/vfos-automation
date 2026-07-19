'use client';

/* =============================================================================
 * VFOS Studio — Douyin re-login widget (Phase B, self-contained)
 * -----------------------------------------------------------------------------
 * Widget ĐỘC LẬP cho việc đăng nhập lại Douyin khi phiên chết (SESSION_EXPIRED).
 * CHỈ nói chuyện với route /api/studio/entertainment/douyin-login (Phase A) — KHÔNG
 * phụ thuộc job list / intake-panel, nên không đụng file đang được session khác sửa.
 * Luồng: bấm → POST mở cửa sổ headful → poll GET tới khi state='CLOSED' → nhắc
 * Operator bấm "↻ Tải lại" (nút sẵn có trong IntakePanel) để chạy lại job lỗi.
 * Login là việc TAY của Operator (No-Go #4) — widget chỉ mở cửa + chờ, không tự giải.
 * ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';

type Phase = 'idle' | 'opening' | 'waiting' | 'done' | 'error';

const POLL_MS = 3000;

export function DouyinSessionBanner() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPoll, [stopPoll]);

  const startPoll = useCallback(() => {
    stopPoll();
    pollRef.current = setInterval(() => {
      void fetch('/api/studio/entertainment/douyin-login')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          const st = j?.status;
          if (st && st.state === 'CLOSED') {
            stopPoll();
            setPhase('done');
            setMsg('✅ Đã đăng nhập lại Douyin. Bấm "↻ Tải lại" ở dưới để chạy lại job lỗi.');
          }
        })
        .catch(() => {
          /* giữ poll — lỗi mạng tạm thời không dừng */
        });
    }, POLL_MS);
  }, [stopPoll]);

  const onLogin = useCallback(async () => {
    if (phase === 'opening' || phase === 'waiting') return;
    setPhase('opening');
    setMsg('Đang mở cửa sổ Douyin…');
    try {
      const r = await fetch('/api/studio/entertainment/douyin-login', { method: 'POST' });
      const j = (await r.json()) as { ok: boolean; message?: string; code?: string };
      if (r.ok) {
        setPhase('waiting');
        setMsg('Cửa sổ Douyin đã mở — đăng nhập / giải captcha rồi ĐÓNG cửa sổ. Đang chờ…');
        startPoll();
      } else {
        setPhase('error');
        setMsg(`🛑 ${j.message ?? j.code ?? 'Không mở được cửa sổ đăng nhập.'}`);
      }
    } catch (e) {
      setPhase('error');
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Lỗi mạng.'}`);
    }
  }, [phase, startPoll]);

  const busy = phase === 'opening' || phase === 'waiting';

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline/50 bg-panel/30 px-3 py-2">
      <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-accent-amber/15 px-2 text-[10px] font-bold text-accent-amber">
        DOUYIN
      </span>
      <span className="text-[11px] text-neutral-400">
        Tải nguồn báo <span className="font-semibold text-accent-rose">phiên hết hạn</span>? Đăng
        nhập lại Douyin ở đây rồi bấm "↻ Tải lại".
      </span>
      <button
        type="button"
        onClick={onLogin}
        disabled={busy}
        className="rounded-lg border border-accent-amber/40 bg-accent-amber/10 px-3 py-1.5 text-[11px] font-bold text-accent-amber transition hover:bg-accent-amber/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Đang chờ đóng cửa sổ…' : 'Đăng nhập lại Douyin'}
      </button>
      {msg && <span className="w-full text-[10px] text-neutral-500">{msg}</span>}
    </div>
  );
}
