'use client';

/* =============================================================================
 * VFOS Studio — Lịch sử & Evidence (UI Architecture V1 — Phase C)
 * -----------------------------------------------------------------------------
 * READ-ONLY: đọc job thật qua /api/studio/jobs (registry/manifest, DTO sanitized)
 * + publish status sanitized qua GET /api/studio/jobs/:id/publish-facebook cho
 * job PUBLISHED. KHÔNG có POST, KHÔNG action thật, KHÔNG xoá/sửa job — đúng
 * nguyên tắc: job hoàn thành nằm trong history để xem lại evidence, không reset.
 * ========================================================================== */

import { Card, CardBody, CardHeader } from '@/components/card';
import { UtilIcon } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui';
import { ACCENT_BG_SOFT } from '@/lib/nav';
import type { GateState, OperatorJobDTO } from '@/lib/studio-data/types';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type FilterKey = 'all' | 'published' | 'ready' | 'working' | 'failed';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'published', label: 'Đã đăng' },
  { key: 'ready', label: 'Đã duyệt / Đóng gói' },
  { key: 'working', label: 'Đang làm' },
  { key: 'failed', label: 'Lỗi / Từ chối' },
];

function matchFilter(job: OperatorJobDTO, filter: FilterKey): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'published':
      return job.state === 'PUBLISHED';
    case 'ready':
      return job.state === 'APPROVED' || job.state === 'PACKAGED';
    case 'failed':
      return job.state === 'FAILED' || job.state === 'REJECTED';
    case 'working':
      return !['PUBLISHED', 'APPROVED', 'PACKAGED', 'FAILED', 'REJECTED'].includes(job.state);
  }
}

const GATE_LABELS: { key: keyof OperatorJobDTO['pipeline']; label: string }[] = [
  { key: 'source', label: 'Nguồn' },
  { key: 'script', label: 'Script' },
  { key: 'voice', label: 'Voice' },
  { key: 'bgm', label: 'BGM' },
  { key: 'render', label: 'Render' },
  { key: 'qa', label: 'QA' },
  { key: 'affiliateLink', label: 'Affiliate' },
];

const GATE_CLS: Record<GateState, string> = {
  pass: 'bg-accent-green/10 text-accent-green',
  warn: 'bg-accent-amber/10 text-accent-amber',
  fail: 'bg-accent-rose/10 text-accent-rose',
};

interface PublishEvidence {
  loading: boolean;
  postId: string | null;
  permalinkUrl: string | null;
  publishVisibility: string | null;
  error: string | null;
}

// biome-ignore lint/style/noDefaultExport: Next.js page requires default export
export default function HistoryPage() {
  const [jobs, setJobs] = useState<OperatorJobDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  // Evidence publish per-job — chỉ fetch khi mở job PUBLISHED, cache theo jobId.
  const [publishEvidence, setPublishEvidence] = useState<Record<string, PublishEvidence>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/studio/jobs', { signal: AbortSignal.timeout(15_000) });
      const body = (await res.json()) as { jobs?: OperatorJobDTO[] };
      const list = body.jobs ?? [];
      // Mới nhất lên đầu — history đọc theo dòng thời gian ngược.
      list.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
      setJobs(list);
    } catch {
      setLoadError('Không tải được danh sách job. Kiểm tra dev server rồi bấm "Tải lại".');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openEvidence = (job: OperatorJobDTO) => {
    const next = openJobId === job.id ? null : job.id;
    setOpenJobId(next);
    // Job PUBLISHED → lấy publish evidence sanitized (permalink/visibility/postId).
    if (next && job.state === 'PUBLISHED' && !publishEvidence[job.id]) {
      setPublishEvidence((prev) => ({
        ...prev,
        [job.id]: {
          loading: true,
          postId: null,
          permalinkUrl: null,
          publishVisibility: null,
          error: null,
        },
      }));
      fetch(`/api/studio/jobs/${job.id}/publish-facebook`, {
        signal: AbortSignal.timeout(20_000),
      })
        .then((r) => r.json())
        .then((pf) => {
          const status = (pf?.publishStatus ?? null) as {
            postId?: string | null;
            permalinkUrl?: string | null;
            publishVisibility?: string | null;
          } | null;
          setPublishEvidence((prev) => ({
            ...prev,
            [job.id]: {
              loading: false,
              postId: status?.postId ?? null,
              permalinkUrl: status?.permalinkUrl ?? null,
              publishVisibility: status?.publishVisibility ?? null,
              error: pf?.ok ? null : 'Không đọc được publish status.',
            },
          }));
        })
        .catch(() => {
          setPublishEvidence((prev) => ({
            ...prev,
            [job.id]: {
              loading: false,
              postId: null,
              permalinkUrl: null,
              publishVisibility: null,
              error: 'Lỗi kết nối khi đọc publish status.',
            },
          }));
        });
    }
  };

  const visible = jobs.filter((j) => matchFilter(j, filter));

  return (
    <div className="space-y-6">
      <PageHeader
        no={5}
        icon="schedule"
        accent="cyan"
        title="Lịch sử & Evidence"
        description="Mọi job đã/đang chạy — read-only. Job hoàn thành không bị xóa; evidence (manifest, QA, affiliate, publish result) xem lại tại đây."
        actions={
          <Button variant="ghost" onClick={() => load()}>
            <UtilIcon name="clock" width={14} height={14} /> Tải lại
          </Button>
        }
      />

      {/* Bộ lọc theo trạng thái vòng đời */}
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
              filter === f.key
                ? 'bg-accent-cyan/15 text-accent-cyan'
                : 'bg-panel/40 text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {f.label}
            <span className="ml-1.5 text-[10px] opacity-70">
              {jobs.filter((j) => matchFilter(j, f.key)).length}
            </span>
          </button>
        ))}
      </div>

      {loading && (
        <Card>
          <CardBody className="p-6 text-xs text-neutral-500">Đang tải danh sách job…</CardBody>
        </Card>
      )}
      {!loading && loadError && (
        <Card>
          <CardBody className="p-6 text-xs text-accent-rose">{loadError}</CardBody>
        </Card>
      )}
      {!loading && !loadError && visible.length === 0 && (
        <Card>
          <CardBody className="p-6 text-xs text-neutral-500">
            Không có job nào khớp bộ lọc này.
          </CardBody>
        </Card>
      )}

      {!loading &&
        !loadError &&
        visible.map((job) => {
          const open = openJobId === job.id;
          const evidence = publishEvidence[job.id];
          return (
            <Card key={job.id} className={open ? 'border-accent-cyan/30' : undefined}>
              {/* Hàng tóm tắt — bấm để mở evidence */}
              <button
                type="button"
                onClick={() => openEvidence(job)}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 text-left"
              >
                <span className="font-mono text-[11px] text-neutral-400">{job.id}</span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-neutral-200">
                  {job.product || job.title}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${ACCENT_BG_SOFT[job.statusAccent]}`}
                >
                  {job.statusLabel}
                </span>
                <span className="text-[10px] text-neutral-500">
                  QA: {job.qaStatus ?? '—'} · Duyệt: {job.operatorDecision}
                </span>
                <span className="text-[10px] text-neutral-600">
                  {job.updatedAt ? new Date(job.updatedAt).toLocaleString('vi-VN') : '—'}
                </span>
                <span className="text-[10px] text-accent-cyan">
                  {open ? '▲ Đóng' : '▼ Evidence'}
                </span>
              </button>

              {/* Panel evidence chi tiết — read-only */}
              {open && (
                <CardBody className="space-y-3 border-t border-hairline/50 p-4 text-[11px]">
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    <p className="text-neutral-400">
                      Lane: <span className="text-neutral-200">{job.lane}</span> · Kênh đề xuất:{' '}
                      <span className="text-neutral-200">{job.suggestedChannel || '—'}</span>
                    </p>
                    <p className="text-neutral-400">
                      Owner affiliate:{' '}
                      <span className={job.ownerValid ? 'text-accent-green' : 'text-accent-rose'}>
                        {job.ownerId ?? '—'} {job.ownerValid ? '✓' : '(không hợp lệ)'}
                      </span>
                    </p>
                    <p className="text-neutral-400">
                      Link affiliate:{' '}
                      <span className="text-neutral-200">
                        {job.productBinding.shortLink ?? '—'}
                      </span>
                    </p>
                    <p className="text-neutral-400">
                      Nguồn video:{' '}
                      <span className="break-all text-neutral-200">
                        {job.sourceVideoUrl ?? job.sourceVideoPath ?? '—'}
                      </span>
                    </p>
                  </div>

                  {/* 7 gate pipeline từ manifest thật */}
                  <div className="flex flex-wrap gap-1.5">
                    {GATE_LABELS.map((g) => (
                      <span
                        key={g.key}
                        className={`rounded px-2 py-1 text-[10px] font-semibold ${GATE_CLS[job.pipeline[g.key]]}`}
                      >
                        {g.label}: {job.pipeline[g.key]}
                      </span>
                    ))}
                  </div>

                  {/* Publish evidence — chỉ job PUBLISHED */}
                  {job.state === 'PUBLISHED' && (
                    <div className="rounded-lg border border-hairline/60 bg-panel/40 p-3 space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                        Publish Evidence (Graph xanh = API publish)
                      </p>
                      {evidence?.loading && <p className="text-neutral-500">Đang đọc…</p>}
                      {evidence?.error && <p className="text-accent-rose">{evidence.error}</p>}
                      {evidence && !evidence.loading && !evidence.error && (
                        <>
                          <p className="text-neutral-400">
                            postId/videoId:{' '}
                            <span className="font-mono text-neutral-200">
                              {evidence.postId ?? '—'}
                            </span>
                          </p>
                          <p className="text-neutral-400">
                            Hiển thị công khai:{' '}
                            <span
                              className={
                                evidence.publishVisibility === 'PUBLIC_CONFIRMED'
                                  ? 'text-accent-green'
                                  : 'text-accent-amber'
                              }
                            >
                              {evidence.publishVisibility === 'PUBLIC_CONFIRMED'
                                ? 'public ✓'
                                : `${evidence.publishVisibility ?? 'UNCONFIRMED'} — Operator kiểm tra bổ sung`}
                            </span>
                          </p>
                          {evidence.permalinkUrl && (
                            <a
                              href={evidence.permalinkUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block text-accent-green underline hover:text-accent-green/80"
                            >
                              Xem bài đăng trên Facebook ↗
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {job.notes && (
                    <p className="text-neutral-500">
                      Ghi chú Operator: <span className="text-neutral-300">{job.notes}</span>
                    </p>
                  )}

                  <div className="border-t border-hairline/50 pt-2.5">
                    <Link href={`/lanes/product-review?jobId=${encodeURIComponent(job.id)}`}>
                      <Button variant="ghost" className="!py-1 !px-2.5 text-[11px]">
                        Mở job này trong lane →
                      </Button>
                    </Link>
                  </div>
                </CardBody>
              )}
            </Card>
          );
        })}

      <Card>
        <CardHeader
          title="Nguyên tắc history"
          subtitle="UI Architecture V1 — Phase C"
          accentClass="text-accent-cyan"
        />
        <CardBody className="p-5 text-[11px] leading-relaxed text-neutral-500">
          Màn này READ-ONLY: không có nút xóa/sửa job. Dữ liệu đọc thẳng từ registry/manifest thật
          (DTO sanitized — không lộ path tuyệt đối/token). Muốn thao tác tiếp một job, dùng "Mở job
          này trong lane" — mọi action vẫn đi qua gate của lane.
        </CardBody>
      </Card>
    </div>
  );
}
