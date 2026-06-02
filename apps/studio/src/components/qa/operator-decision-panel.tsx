'use client';

import { type QaJob, REJECT_REASON_OPTIONS, canApproveQa } from '@/lib/mock-data';
import { useState } from 'react';
import { Card, CardBody, CardHeader } from '../card';
import { UtilIcon } from '../icons';
import { Button } from '../ui';

type Decision = 'none' | 'approved' | 'rejected';

/**
 * H. Operator Decision Panel — Approve / Reject + lý do reject.
 * State CỤC BỘ trên UI (mock) — KHÔNG gọi API, KHÔNG publish thật.
 */
export function OperatorDecisionPanel({ job }: { job: QaJob }) {
  const [decision, setDecision] = useState<Decision>('none');
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState('');

  const canApprove = canApproveQa(job);
  const alreadyDecided = job.operatorStatus !== 'pending';

  const toggleReason = (r: string) =>
    setReasons((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title="Quyết định của Operator"
        subtitle="QA bắt buộc PASS trước khi duyệt · duyệt trước khi publish"
        no={8}
        accentClass="text-accent-green"
      />
      <CardBody className="flex flex-1 flex-col gap-3">
        {alreadyDecided && (
          <p
            className={`rounded-lg border px-3 py-2 text-[11px] ${
              job.operatorStatus === 'approved'
                ? 'border-accent-green/30 bg-accent-green/10 text-accent-green'
                : 'border-accent-rose/30 bg-accent-rose/10 text-accent-rose'
            }`}
          >
            Nội dung này đã {job.operatorStatus === 'approved' ? 'được duyệt' : 'bị reject'}
            {job.rejectReason ? ` — ${job.rejectReason}` : ''}.
          </p>
        )}

        {!canApprove && !alreadyDecided && (
          <p className="rounded-lg border border-accent-amber/30 bg-accent-amber/10 px-3 py-2 text-[11px] text-accent-amber">
            Chưa thể duyệt: QA chưa PASS (FAIL/BLOCKED/chờ QA). Hãy reject kèm lý do hoặc xử lý lỗi
            trước.
          </p>
        )}

        {/* Reject reason chips */}
        <div>
          <p className="mb-1.5 text-[11px] font-medium text-neutral-400">
            Lý do reject (chọn nhanh)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {REJECT_REASON_OPTIONS.map((r) => {
              const active = reasons.includes(r);
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggleReason(r)}
                  className={`rounded-full px-2.5 py-1 text-[10px] transition ${
                    active
                      ? 'bg-accent-rose/20 text-accent-rose ring-1 ring-accent-rose/40'
                      : 'bg-raised/60 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </div>

        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ghi chú lý do reject (tuỳ chọn)…"
          className="w-full resize-none rounded-lg border border-hairline bg-panel/80 px-3 py-2 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-accent-rose/40"
        />

        <div className="mt-auto grid grid-cols-2 gap-2">
          <Button variant="danger" onClick={() => setDecision('rejected')}>
            <UtilIcon name="x" width={13} height={13} /> Reject
          </Button>
          <Button variant="success" disabled={!canApprove} onClick={() => setDecision('approved')}>
            <UtilIcon name="check" width={13} height={13} /> Approve
          </Button>
        </div>

        {decision !== 'none' && (
          <p className="rounded-lg border border-hairline bg-raised/60 px-3 py-2 text-[11px] text-neutral-300">
            <span className="font-semibold text-neutral-100">(mock)</span> Đã ghi nhận{' '}
            <span className={decision === 'approved' ? 'text-accent-green' : 'text-accent-rose'}>
              {decision === 'approved' ? 'APPROVE' : 'REJECT'}
            </span>{' '}
            cho {job.id}
            {decision === 'rejected' && reasons.length > 0 ? ` — ${reasons.join(', ')}` : ''}. Không
            gọi API, không publish thật.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
