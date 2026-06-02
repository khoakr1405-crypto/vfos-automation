'use client';

import type { OperatorJobDTO } from '@/lib/studio-data/types';
import { useEffect, useState } from 'react';
import { Badge } from '../badge';
import { Card, CardBody } from '../card';
import { Icon, UtilIcon } from '../icons';
import { Button } from '../ui';

type LoadState = 'loading' | 'ready' | 'error';

// Round UI-03: dữ liệu job đọc THẬT và wire nút bấm Approve/Reject thật.
export function OperatorJobQueue() {
  const [jobs, setJobs] = useState<OperatorJobDTO[]>([]);
  const [load, setLoad] = useState<LoadState>('loading');
  
  // UI-03 state for operations
  const [loadingJobs, setLoadingJobs] = useState<Record<string, boolean>>({});
  const [errorJobs, setErrorJobs] = useState<Record<string, { code: string; message: string; details?: string[] } | null>>({});
  const [rejectingJobId, setRejectingJobId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/studio/jobs')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { jobs?: OperatorJobDTO[] }) => {
        if (!alive) return;
        setJobs(Array.isArray(data.jobs) ? data.jobs : []);
        setLoad('ready');
      })
      .catch(() => {
        if (!alive) return;
        setLoad('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleApprove = async (jobId: string) => {
    const confirmApprove = window.confirm(
      "Phê duyệt video này? Video sẽ chuyển sang APPROVED / Publish Queue readiness, nhưng chưa publish."
    );
    if (!confirmApprove) return;

    setLoadingJobs((prev) => ({ ...prev, [jobId]: true }));
    setErrorJobs((prev) => ({ ...prev, [jobId]: null }));

    try {
      const res = await fetch(`/api/studio/jobs/${encodeURIComponent(jobId)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorJobs((prev) => ({
          ...prev,
          [jobId]: {
            code: data.code || 'APPROVE_FAILED',
            message: data.message || 'Phê duyệt thất bại.',
            details: data.details || [],
          },
        }));
      } else {
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId && data.job ? data.job : j))
        );
      }
    } catch (err: any) {
      setErrorJobs((prev) => ({
        ...prev,
        [jobId]: {
          code: 'NETWORK_ERROR',
          message: err.message || 'Lỗi mạng khi thực hiện phê duyệt.',
        },
      }));
    } finally {
      setLoadingJobs((prev) => ({ ...prev, [jobId]: false }));
    }
  };

  const handleReject = async (jobId: string) => {
    if (!rejectNotes.trim() || rejectNotes.trim().length < 3) return;

    setLoadingJobs((prev) => ({ ...prev, [jobId]: true }));
    setErrorJobs((prev) => ({ ...prev, [jobId]: null }));

    try {
      const res = await fetch(`/api/studio/jobs/${encodeURIComponent(jobId)}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: rejectNotes.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorJobs((prev) => ({
          ...prev,
          [jobId]: {
            code: data.code || 'REJECT_FAILED',
            message: data.message || 'Từ chối thất bại.',
            details: data.details || [],
          },
        }));
      } else {
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId && data.job ? data.job : j))
        );
        setRejectingJobId(null);
        setRejectNotes('');
      }
    } catch (err: any) {
      setErrorJobs((prev) => ({
        ...prev,
        [jobId]: {
          code: 'NETWORK_ERROR',
          message: err.message || 'Lỗi mạng khi thực hiện từ chối.',
        },
      }));
    } finally {
      setLoadingJobs((prev) => ({ ...prev, [jobId]: false }));
    }
  };

  const getPipeIcon = (state: 'pass' | 'fail' | 'warn') => {
    if (state === 'pass') {
      return (
        <span
          className="flex h-4 w-4 items-center justify-center rounded-full bg-accent-green/10 text-accent-green"
          title="Đạt"
        >
          <UtilIcon name="check" width={10} height={10} />
        </span>
      );
    }
    if (state === 'fail') {
      return (
        <span
          className="flex h-4 w-4 items-center justify-center rounded-full bg-accent-rose/10 text-accent-rose"
          title="Lỗi"
        >
          <UtilIcon name="x" width={10} height={10} />
        </span>
      );
    }
    return (
      <span
        className="flex h-4 w-4 items-center justify-center rounded-full bg-accent-amber/10 text-accent-amber"
        title="Chưa hoàn tất / chờ"
      >
        <UtilIcon name="bell" width={10} height={10} />
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent-blue animate-pulse" />
            Hành lang kiểm soát video jobs (Active Lane: Review sản phẩm)
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Dữ liệu job thật tích hợp API xử lý phê duyệt/từ chối an toàn (Approve không publish).
          </p>
        </div>
        <div className="flex gap-2">
          <Badge accent="blue">Ngách: Review</Badge>
          <Badge accent="green">Nguồn: Job thật</Badge>
        </div>
      </div>

      {load === 'loading' && (
        <Card className="border-hairline bg-card/85">
          <CardBody className="p-6 text-center text-xs text-neutral-500">
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-blue animate-ping" />
              Đang tải job thật từ /api/studio/jobs…
            </span>
          </CardBody>
        </Card>
      )}

      {load === 'error' && (
        <Card className="border-accent-rose/30 bg-card/90">
          <CardBody className="p-6 text-center text-xs text-accent-rose">
            Không đọc được job thật (data boundary lỗi). UI vẫn an toàn — thử tải lại trang.
          </CardBody>
        </Card>
      )}

      {load === 'ready' && jobs.length === 0 && (
        <Card className="border-hairline bg-card/85">
          <CardBody className="p-6 text-center text-xs text-neutral-500 space-y-1">
            <p className="font-semibold text-neutral-300">Chưa có job thật trong registry.</p>
            <p>
              Tạo job bằng <span className="font-mono text-neutral-400">pnpm job:create</span> rồi
              tải lại dashboard.
            </p>
          </CardBody>
        </Card>
      )}

      {load === 'ready' && jobs.length > 0 && (
        <div className="grid gap-5">
          {jobs.map((job) => (
            <Card
              key={job.id}
              className={`transition border ${
                job.state === 'APPROVED' || job.state === 'PACKAGED'
                  ? 'border-accent-green/30 bg-accent-green/5'
                  : job.state === 'REJECTED'
                    ? 'border-accent-rose/20 bg-accent-rose/5 opacity-70'
                    : job.state === 'FAILED'
                      ? 'border-accent-rose/30 bg-card/90'
                      : 'border-hairline hover:border-neutral-700 bg-card/85'
              }`}
            >
              <CardBody className="p-5 flex flex-col md:flex-row gap-5">
                {/* Left Column: 9:16 preview — video thật nếu có, else placeholder */}
                <div className="w-full md:w-[150px] shrink-0 flex flex-col items-center">
                  <div className="relative aspect-[9/16] w-[130px] rounded-xl overflow-hidden bg-neutral-950 border border-hairline/85 shadow-lg group">
                    {job.hasPreview && job.previewUrl ? (
                      <video
                        src={job.previewUrl}
                        controls
                        preload="none"
                        className="absolute inset-0 h-full w-full bg-neutral-950 object-contain"
                      >
                        <track kind="captions" />
                      </video>
                    ) : (
                      <>
                        <div className="absolute inset-0 bg-gradient-to-tr from-accent-violet/30 via-neutral-900/40 to-accent-blue/30" />
                        <div className="absolute inset-0 bg-neutral-950/20" />
                        <div className="absolute inset-0 flex items-center justify-center px-2 text-center">
                          <span className="text-[9px] text-neutral-400 leading-snug">
                            Chưa có preview
                            <br />({job.statusLabel})
                          </span>
                        </div>
                      </>
                    )}

                    {/* Duration Badge */}
                    <div className="absolute top-2 right-2 bg-neutral-950/80 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold text-neutral-300 pointer-events-none">
                      {job.duration}
                    </div>

                    {/* Platform Indicator */}
                    <div className="absolute top-2 left-2 bg-neutral-950/70 p-1 rounded pointer-events-none">
                      {job.platform === 'tiktok' && (
                        <Icon name="publish" width={10} height={10} className="text-accent-cyan" />
                      )}
                      {job.platform === 'facebook' && (
                        <Icon name="channels" width={10} height={10} className="text-accent-blue" />
                      )}
                      {job.platform === 'youtube' && (
                        <Icon
                          name="analytics"
                          width={10}
                          height={10}
                          className="text-accent-rose"
                        />
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-neutral-500 font-medium mt-2">
                    Preview (Dọc 9:16)
                  </span>
                </div>

                {/* Right Column: Metadata and Operations */}
                <div className="flex-1 space-y-4">
                  {/* Header Row */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-accent-blue tracking-wide">
                          {job.id}
                        </span>
                        <span className="text-neutral-600 font-medium text-xs">·</span>
                        <span className="text-xs text-neutral-400 font-semibold">{job.lane}</span>
                        <span className="text-neutral-600 font-medium text-xs">·</span>
                        <span className="text-xs font-bold text-accent-amber bg-accent-amber/10 px-2 py-0.5 rounded">
                          {job.price}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-neutral-100 mt-1">{job.title}</h4>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        Sản phẩm:{' '}
                        <span className="font-semibold text-neutral-200">{job.product}</span>
                      </p>
                    </div>
                    <div>
                      <Badge accent={job.statusAccent}>{job.statusLabel}</Badge>
                    </div>
                  </div>

                  {/* Pipeline Steps Dashboard */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 bg-raised/30 border border-hairline/50 p-2.5 rounded-xl text-center">
                    <div className="space-y-1">
                      <p className="text-[9px] text-neutral-500 uppercase tracking-wider">
                        Source Video
                      </p>
                      <div className="flex justify-center">{getPipeIcon(job.pipeline.source)}</div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] text-neutral-500 uppercase tracking-wider">Script</p>
                      <div className="flex justify-center">{getPipeIcon(job.pipeline.script)}</div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] text-neutral-500 uppercase tracking-wider">
                        Voice AI
                      </p>
                      <div className="flex justify-center">{getPipeIcon(job.pipeline.voice)}</div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] text-neutral-500 uppercase tracking-wider">
                        BGM Mix
                      </p>
                      <div className="flex justify-center">{getPipeIcon(job.pipeline.bgm)}</div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] text-neutral-500 uppercase tracking-wider">Render</p>
                      <div className="flex justify-center">{getPipeIcon(job.pipeline.render)}</div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] text-neutral-500 uppercase tracking-wider">
                        Tech QA
                      </p>
                      <div className="flex justify-center">{getPipeIcon(job.pipeline.qa)}</div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] text-neutral-500 uppercase tracking-wider">
                        Affiliate
                      </p>
                      <div className="flex justify-center">
                        {job.pipeline.affiliateLink === 'pass' ? (
                          <span
                            className="inline-flex items-center text-[10px] text-accent-green font-bold gap-0.5"
                            title={`Shopee Owner Valid: ${job.ownerId ?? ''}`}
                          >
                            <UtilIcon name="check" width={10} height={10} /> Valid
                          </span>
                        ) : job.pipeline.affiliateLink === 'fail' ? (
                          <span className="inline-flex items-center text-[10px] text-accent-rose font-bold gap-0.5">
                            <UtilIcon name="x" width={10} height={10} /> Invalid
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[10px] text-accent-amber font-bold gap-0.5">
                            <UtilIcon name="bell" width={10} height={10} /> Chưa rõ
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Channel Suggestion details */}
                  <div className="rounded-xl border border-accent-blue/15 bg-accent-blue/5 p-3 flex items-start gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-accent-blue/10 text-accent-blue flex items-center justify-center shrink-0 mt-0.5">
                      <UtilIcon name="sparkle" width={12} height={12} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-neutral-200">
                        Gợi ý phát sóng:{' '}
                        <span className="text-accent-blue">{job.suggestedChannel}</span> (Publish
                        Target: {job.platform.toUpperCase()})
                      </p>
                      <p className="text-[11px] text-neutral-400 mt-0.5 leading-snug">
                        {job.reason}
                      </p>
                    </div>
                  </div>

                  {/* Technical error log — chỉ hiện khi state = FAILED */}
                  {job.errorLog && (
                    <div className="rounded-xl border border-accent-rose/25 bg-neutral-950 p-3.5 font-mono text-[11px] text-accent-rose space-y-1.5 shadow-inner">
                      <div className="flex items-center justify-between border-b border-accent-rose/10 pb-1.5 mb-1.5">
                        <span className="font-bold uppercase tracking-wider flex items-center gap-1.5 text-xs">
                          <span className="h-1.5 w-1.5 rounded-full bg-accent-rose animate-ping" />
                          TECHNICAL ERROR REPORT LOG
                        </span>
                        <span className="text-[9px] text-neutral-600 bg-accent-rose/5 px-2 py-0.5 rounded border border-accent-rose/10">
                          STAGE: {job.errorLog.stage.toUpperCase()}
                        </span>
                      </div>
                      <p>
                        <span className="text-neutral-500">Error:</span> {job.errorLog.error}
                      </p>
                    </div>
                  )}

                  {/* UI-03: Action error panel if any */}
                  {errorJobs[job.id] && (
                    <div className="rounded-xl border border-accent-rose/25 bg-neutral-950 p-3.5 font-mono text-[11px] text-accent-rose space-y-1.5 shadow-inner">
                      <div className="flex items-center justify-between border-b border-accent-rose/10 pb-1.5 mb-1.5">
                        <span className="font-bold uppercase tracking-wider flex items-center gap-1.5 text-xs text-accent-rose">
                          <span className="h-1.5 w-1.5 rounded-full bg-accent-rose animate-ping" />
                          THAO TÁC THẤT BẠI (ACTION FAILURE)
                        </span>
                        <span className="text-[9px] text-neutral-600 bg-accent-rose/5 px-2 py-0.5 rounded border border-accent-rose/10">
                          MÃ LỖI: {errorJobs[job.id]?.code}
                        </span>
                      </div>
                      <p className="font-bold text-neutral-200">{errorJobs[job.id]?.message}</p>
                      {errorJobs[job.id]?.details && errorJobs[job.id]!.details!.length > 0 && (
                        <ul className="list-disc pl-4 space-y-1 mt-1 text-neutral-400">
                          {errorJobs[job.id]!.details!.map((det, idx) => (
                            <li key={idx}>{det}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* UI-03: Operator Actions row */}
                  {job.state === 'READY_FOR_OPERATOR_REVIEW' && (
                    <div className="space-y-3 pt-2">
                      {rejectingJobId === job.id ? (
                        <div className="space-y-2 bg-neutral-900/50 p-3 rounded-xl border border-hairline/40">
                          <label className="block text-xs font-bold text-neutral-200">
                            Nhập lý do từ chối (bắt buộc, tối thiểu 3 ký tự):
                          </label>
                          <textarea
                            value={rejectNotes}
                            onChange={(e) => setRejectNotes(e.target.value)}
                            placeholder="Ví dụ: Video có logo douyin/watermark, giọng đọc bị vấp, BGM quá to..."
                            className="w-full bg-neutral-950 border border-hairline/80 rounded-lg p-2.5 text-xs text-neutral-100 placeholder-neutral-500 font-sans focus:outline-none focus:border-accent-rose"
                            rows={2}
                            disabled={loadingJobs[job.id]}
                          />
                          <div className="flex gap-2 justify-end">
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setRejectingJobId(null);
                                setRejectNotes('');
                              }}
                              disabled={loadingJobs[job.id]}
                              className="px-3 py-1 text-xs font-semibold text-neutral-400 border border-hairline hover:bg-neutral-800"
                            >
                              Hủy
                            </Button>
                            <Button
                              variant="danger"
                              onClick={() => handleReject(job.id)}
                              disabled={loadingJobs[job.id] || rejectNotes.trim().length < 3}
                              className="px-3 py-1 text-xs font-bold text-white bg-accent-rose hover:bg-accent-rose/90 flex items-center gap-1"
                            >
                              {loadingJobs[job.id] ? (
                                <span className="h-3.5 w-3.5 animate-spin border-2 border-white/30 border-t-white rounded-full" />
                              ) : (
                                <UtilIcon name="x" width={12} height={12} />
                              )}
                              Xác nhận từ chối
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="success"
                              onClick={() => handleApprove(job.id)}
                              disabled={!job.canReview || loadingJobs[job.id]}
                              className="text-white font-bold px-4 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
                            >
                              {loadingJobs[job.id] ? (
                                <span className="h-3.5 w-3.5 animate-spin border-2 border-white/30 border-t-white rounded-full" />
                              ) : (
                                <UtilIcon name="check" width={12} height={12} />
                              )}
                              Phê duyệt
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => setRejectingJobId(job.id)}
                              disabled={loadingJobs[job.id]}
                              className="border border-hairline text-neutral-300 font-bold px-4 py-1.5 flex items-center gap-1.5 hover:bg-raised/40"
                            >
                              <UtilIcon name="x" width={12} height={12} />
                              Từ chối
                            </Button>
                          </div>
                          <p className="text-[10px] text-neutral-500">
                            * Approve không publish — chỉ chuyển sang APPROVED để đóng gói và đưa vào Publish Queue.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* UI-03: Decision Display Row */}
                  {(job.state === 'APPROVED' || job.state === 'REJECTED' || job.state === 'PACKAGED') && (
                    <div className="pt-2 border-t border-hairline/20 flex flex-wrap items-center gap-2">
                      {job.state === 'APPROVED' && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-accent-green font-bold bg-accent-green/10 px-3 py-1 rounded-lg">
                          <UtilIcon name="check" width={14} height={14} />
                          Đã duyệt — chờ Publish Queue
                        </span>
                      )}
                      {job.state === 'REJECTED' && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-accent-rose font-bold bg-accent-rose/10 px-3 py-1 rounded-lg">
                          <UtilIcon name="x" width={14} height={14} />
                          Đã từ chối
                        </span>
                      )}
                      {job.state === 'PACKAGED' && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-accent-cyan font-bold bg-accent-cyan/10 px-3 py-1 rounded-lg">
                          <UtilIcon name="sparkle" width={14} height={14} />
                          Đã đóng gói — sẵn sàng Publish
                        </span>
                      )}
                      {job.operatorDecision && job.operatorDecision !== 'PENDING' && (
                        <p className="text-[10px] text-neutral-400 italic">
                          Ý kiến Operator: {job.operatorDecision === 'APPROVED' ? 'Duyệt đạt' : 'Từ chối'}{' '}
                          {job.notes ? `(${job.notes})` : ''}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
