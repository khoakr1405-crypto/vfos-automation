'use client';

import type { PublishContent } from '@/lib/types';
import { useState } from 'react';
import { UtilIcon } from '../icons';

interface LivePublishPanelProps {
  content: PublishContent;
}

interface PublishResult {
  ok: boolean;
  code?: string;
  message?: string;
  details?: string[];
  reason?: string;
  exitCode?: number | null;
  stderr?: string;
  stdout?: string;
  jobState?: string | null;
  published?: boolean;
  result?: {
    state?: string | null;
    published?: boolean | null;
    postId?: string | null;
    videoId?: string | null;
    pageName?: string | null;
  } | null;
}

/**
 * Round UI-06 — Local-only guarded LIVE publish.
 * Nút mặc định DISABLED. Chỉ mở khi: env flag bật + gate pass + chưa publish.
 * Đăng thật chỉ chạy sau khi Operator gõ đúng confirm phrase `PUBLISH <jobId>`.
 * Backend tự kiểm tra lại toàn bộ (local-only, env, gate, phrase) — không tin client.
 */
export function LivePublishPanel({ content }: LivePublishPanelProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);

  if (!content) return null;

  const envEnabled = content.livePublishEnabled === true;
  const blockedReasons = content.liveGateBlockedReasons ?? [];
  const alreadyPublished = content.alreadyPublished === true;
  const confirmPhrase = content.confirmPhrase || `PUBLISH ${content.id}`;
  const targetChannel = content.payloadPreview?.targetChannel || 'Kênh Review Sản Phẩm #1';

  const canPublish = envEnabled && blockedReasons.length === 0 && !alreadyPublished;

  let disabledReason: string | null = null;
  if (alreadyPublished) {
    disabledReason = 'Blocked: job đã được publish trước đó.';
  } else if (!envEnabled) {
    disabledReason =
      content.livePublishEnabledReason ||
      'Blocked: live publish env flag disabled (VFOS_STUDIO_ALLOW_LIVE_PUBLISH chưa bật).';
  } else if (blockedReasons.length > 0) {
    disabledReason = `Blocked: ${blockedReasons[0]}`;
  }

  const phraseMatches = phrase.trim() === confirmPhrase;

  const openModal = () => {
    if (!canPublish) return;
    setPhrase('');
    setResult(null);
    setModalOpen(true);
  };

  const submitPublish = async () => {
    if (!phraseMatches || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/studio/jobs/${encodeURIComponent(content.id)}/publish-facebook`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            confirmPhrase: phrase.trim(),
            expectedProduct: content.productBinding,
          }),
        },
      );
      const data = (await res.json()) as PublishResult;
      setResult(data);
      if (data.ok) setModalOpen(false);
    } catch (err) {
      setResult({
        ok: false,
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-accent-rose/20 bg-accent-rose/[0.03] p-5 backdrop-blur-md space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-hairline pb-4">
        <div className="flex items-center gap-2.5">
          <span className="text-accent-rose shrink-0">
            <UtilIcon name="bell" width={18} height={18} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-neutral-100">
              Đăng thật lên Facebook — Local-only Guarded
            </h3>
            <p className="text-[11px] text-neutral-500">
              Chỉ chạy trên máy Operator (localhost), khi đủ toàn bộ guard an toàn
            </p>
          </div>
        </div>
        <div
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
            envEnabled ? 'bg-accent-amber/10 text-accent-amber' : 'bg-neutral-800 text-neutral-400'
          }`}
        >
          {envEnabled ? 'Env Flag ON' : 'Env Flag OFF'}
        </div>
      </div>

      {/* Mandatory safety disclaimers */}
      <ul className="rounded-xl border border-hairline bg-neutral-950/40 px-4 py-3 text-[11px] text-neutral-400 space-y-1.5 list-disc pl-7">
        <li>
          Live publish chỉ chạy <span className="text-neutral-200 font-medium">local-only</span>,
          sau khi đủ guard: env flag + gate server-side + confirm phrase chính xác.
        </li>
        <li>
          Không token nào bị log hoặc trả về client — chỉ trạng thái đã{' '}
          <span className="text-neutral-200 font-medium">sanitize</span> được hiển thị.
        </li>
        <li>
          Approve ≠ Publish. Nút này gọi command thật{' '}
          <span className="font-mono text-neutral-300">
            job:publish-facebook --confirm-live-publish
          </span>
          .
        </li>
      </ul>

      {/* Target summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCell label="Job" value={content.id} mono />
        <SummaryCell label="Nền tảng" value="Facebook Reels" />
        <SummaryCell label="Kênh/Page" value={targetChannel} />
        <SummaryCell
          label="Facebook Credentials"
          value={content.facebookCredentialsConfigured ? 'Đã cấu hình' : 'Chưa cấu hình'}
          tone={content.facebookCredentialsConfigured ? 'green' : 'amber'}
        />
      </div>

      {/* Blocked reasons list (if any) */}
      {!canPublish && (
        <div className="rounded-xl border border-accent-amber/20 bg-accent-amber/5 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-accent-amber">
            <UtilIcon name="bell" width={14} height={14} className="shrink-0" />
            <span>Live publish đang bị khóa</span>
          </div>
          <p className="text-[11px] text-neutral-400">{disabledReason}</p>
          {envEnabled && blockedReasons.length > 0 && (
            <ul className="list-disc pl-5 space-y-0.5 text-[10px] text-neutral-500">
              {blockedReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Action button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={openModal}
          disabled={!canPublish}
          className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors ${
            canPublish
              ? 'bg-accent-rose text-white hover:bg-accent-rose/90'
              : 'cursor-not-allowed bg-neutral-800 text-neutral-500'
          }`}
        >
          Đăng thật lên Facebook
        </button>
        {!canPublish && <span className="text-[11px] text-neutral-500">{disabledReason}</span>}
      </div>

      {/* Result panels (outside modal) */}
      {result?.ok && (
        <div className="rounded-xl border border-accent-green/30 bg-accent-green/5 px-4 py-3 space-y-1.5 text-[11px]">
          <div className="flex items-center gap-2 font-semibold text-accent-green">
            <UtilIcon name="check" width={14} height={14} />
            <span>Live publish hoàn tất</span>
          </div>
          <div className="text-neutral-300 font-mono">
            State: {result.jobState ?? '—'} · Post: {result.result?.postId ?? '—'} · Page:{' '}
            {result.result?.pageName ?? '—'}
          </div>
        </div>
      )}
      {result && !result.ok && !modalOpen && <ErrorPanel result={result} />}

      {/* Confirm modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-accent-rose/30 bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 border-b border-hairline pb-3">
              <span className="text-accent-rose">
                <UtilIcon name="bell" width={20} height={20} />
              </span>
              <h4 className="text-sm font-semibold text-neutral-100">
                Bạn sắp ĐĂNG THẬT video này
              </h4>
            </div>

            <div className="space-y-1.5 text-[12px] text-neutral-300">
              <Row k="Job" v={content.id} mono />
              <Row k="Sản phẩm" v={content.product} />
              <Row k="Nền tảng" v="Facebook" />
              <Row k="Kênh/Page" v={targetChannel} />
              <Row k="Trạng thái" v="APPROVED/PACKAGED + QA PASS + PACKAGE READY" />
            </div>

            <p className="text-[11px] text-accent-amber leading-relaxed">
              Hành động này sẽ dùng Facebook token server-side. Video có thể xuất hiện công khai
              trên kênh đã chọn. Không thể hoàn tác từ giao diện này.
            </p>

            <div className="space-y-2">
              <span className="block text-[11px] text-neutral-400">
                Để xác nhận, nhập chính xác:{' '}
                <span className="font-mono text-neutral-100">{confirmPhrase}</span>
              </span>
              <input
                type="text"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder={confirmPhrase}
                spellCheck={false}
                autoComplete="off"
                className="w-full rounded-lg border border-hairline bg-neutral-950/80 px-3 py-2 font-mono text-sm text-neutral-100 outline-none focus:border-accent-rose/50"
              />
            </div>

            {result && !result.ok && <ErrorPanel result={result} />}

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                className="rounded-lg px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 disabled:opacity-50"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={submitPublish}
                disabled={!phraseMatches || submitting}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  phraseMatches && !submitting
                    ? 'bg-accent-rose text-white hover:bg-accent-rose/90'
                    : 'cursor-not-allowed bg-neutral-800 text-neutral-500'
                }`}
              >
                {submitting && (
                  <span className="animate-spin">
                    <UtilIcon name="clock" width={14} height={14} />
                  </span>
                )}
                Xác nhận đăng thật
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCell({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'green' | 'amber';
}) {
  const toneClass =
    tone === 'green'
      ? 'text-accent-green'
      : tone === 'amber'
        ? 'text-accent-amber'
        : 'text-neutral-200';
  return (
    <div className="rounded-xl border border-hairline bg-raised/20 p-3 space-y-1">
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      <span
        className={`block text-xs font-semibold ${mono ? 'font-mono' : ''} ${toneClass} line-clamp-1`}
      >
        {value}
      </span>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0 text-neutral-500">{k}:</span>
      <span className={`text-neutral-200 ${mono ? 'font-mono' : ''}`}>{v}</span>
    </div>
  );
}

function ErrorPanel({ result }: { result: PublishResult }) {
  return (
    <div className="rounded-xl border border-accent-rose/30 bg-accent-rose/5 px-4 py-3 space-y-1.5 text-[11px]">
      <div className="flex items-center gap-2 font-semibold text-accent-rose">
        <UtilIcon name="x" width={14} height={14} />
        <span>{result.code || 'PUBLISH_FAILED'}</span>
      </div>
      {result.message && <p className="text-neutral-300">{result.message}</p>}
      {result.reason && <p className="text-neutral-400">{result.reason}</p>}
      {typeof result.exitCode === 'number' && (
        <p className="text-neutral-500 font-mono">Exit code: {result.exitCode}</p>
      )}
      {result.details && result.details.length > 0 && (
        <ul className="list-disc pl-5 space-y-0.5 text-neutral-400">
          {result.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
      {result.stderr && (
        <pre className="mt-1 max-h-32 overflow-auto rounded bg-neutral-950/80 p-2 text-[10px] text-neutral-500 whitespace-pre-wrap">
          {result.stderr}
        </pre>
      )}
    </div>
  );
}
