'use client';

/* =============================================================================
 * VFOS Studio — Product Review Command Center (Round A — skeleton, READ-ONLY)
 * -----------------------------------------------------------------------------
 * KHÔNG còn là navigation shell. Đây là Command Center với 3 workflow action
 * panel. Round A chỉ ĐỌC state thật (GET) và hiển thị; mọi nút chạy tác vụ thật
 * đều disabled ("sắp wire ở round sau"). KHÔNG POST, KHÔNG tạo job, KHÔNG render,
 * KHÔNG publish, KHÔNG Shopee extraction, KHÔNG gọi API ngoài.
 *
 * Gate-driven UX: Hành động 2 mở khi có Product Card hợp lệ; Hành động 3 mở khi
 * job mới nhất đã APPROVED. QA là bước con BÊN TRONG Hành động 2 (không tách
 * thành action lớn riêng).
 * ========================================================================== */

import { Card } from '@/components/card';
import { Icon, UtilIcon } from '@/components/icons';
import { MockBanner } from '@/components/mock-banner';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui';
import { ACCENT_BG_SOFT, ACCENT_TEXT, type AccentKey } from '@/lib/nav';
import type { GateState, OperatorJobDTO } from '@/lib/studio-data/types';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

// ---- API response shapes (subset we read) ----------------------------------
interface CardSummary {
  name: string;
  shopId: string;
  itemId: string;
  shortLink: string;
  affiliateOwnerId: string;
  ownerVerified: boolean;
  validationStatus: string;
  score?: number;
  commissionRate?: string;
  price?: string;
  productImageUrl?: string | null;
}
interface CardResponse {
  ok: boolean;
  expectedOwner: string;
  hasCard: boolean;
  card: CardSummary | null;
}
interface SourceDraftResponse {
  ok: boolean;
  draft: {
    updatedAt?: string;
    product: { shortLink: string; shopid: string; itemid: string } | null;
    source: { kind: string; url: string; status: string };
  } | null;
}
interface JobsResponse {
  count: number;
  jobs: OperatorJobDTO[];
}

// ---------------------------------------------------------------------------
interface RegistryItem {
  shortLink: string;
  productName: string;
  shopid: string;
  itemid: string;
  affiliateOwnerId: string;
  ownerVerified: boolean;
  status: string;
  productImageUrl?: string | null;
  score?: number;
  commissionRate?: string;
  price?: string;
}

// Shape returned by POST /api/studio/commerce/shopee-extract-one-link
interface ExtractionResult {
  ok: boolean;
  status: 'SUCCESS' | 'SUSPENDED' | 'FAIL';
  message: string;
  shortLink?: string;
  productName?: string;
  shopid?: string;
  itemid?: string;
  ownerVerified?: boolean;
  expectedOwner?: string;
  productImageCaptured?: boolean;
  inserted?: boolean;
  duplicate?: boolean;
}

// ---------------------------------------------------------------------------
// biome-ignore lint/style/noDefaultExport: Next.js page requires default export
export default function ProductReviewLanePage() {
  const [card, setCard] = useState<CardSummary | null>(null);
  const [draft, setDraft] = useState<SourceDraftResponse['draft']>(null);
  const [latestJob, setLatestJob] = useState<OperatorJobDTO | null>(null);
  const [jobCount, setJobCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  // Action 1 states
  const [registry, setRegistry] = useState<RegistryItem[]>([]);
  const [showRegistry, setShowRegistry] = useState(false);
  const [showExtractor, setShowExtractor] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [isPromoting, setIsPromoting] = useState<string>('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [highlightShortLink, setHighlightShortLink] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Action 2 states
  const [sourceUrlInput, setSourceUrlInput] = useState('');
  const [savingSource, setSavingSource] = useState(false);
  const [sourceNotice, setSourceNotice] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [confirmJobPhrase, setConfirmJobPhrase] = useState('');
  const [creatingJob, setCreatingJob] = useState(false);
  const [jobCreatedSuccess, setJobCreatedSuccess] = useState<{
    jobId: string;
    status: string;
    productName?: string;
    sourceUrl?: string;
  } | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [showConfirmJob, setShowConfirmJob] = useState(false);

  // Round C2 states
  const [intakeConfirmInput, setIntakeConfirmInput] = useState('');
  const [approveConfirmInput, setApproveConfirmInput] = useState('');
  const [cleanlinessNotes, setCleanlinessNotes] = useState('');
  const [submittingIntake, setSubmittingIntake] = useState(false);
  const [submittingApprove, setSubmittingApprove] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Round C3 states (Action 2 — chạy sản xuất video)
  const [showRunConfirm, setShowRunConfirm] = useState(false);
  const [runConfirmInput, setRunConfirmInput] = useState('');
  const [submittingRun, setSubmittingRun] = useState(false);
  const [runNotice, setRunNotice] = useState<string | null>(null);
  const [runStage, setRunStage] = useState<string | null>(null);
  const [runReport, setRunReport] = useState<string | null>(null);
  const [productionLaunched, setProductionLaunched] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cardRes, draftRes, jobsRes, registryRes] = await Promise.allSettled([
        fetch('/api/studio/commerce/current-product-card').then((r) => r.json()),
        fetch('/api/studio/create/source-draft').then((r) => r.json()),
        fetch('/api/studio/jobs').then((r) => r.json()),
        fetch('/api/studio/commerce/shopee-registry').then((r) => r.json()),
      ]);
      let currentCard: CardSummary | null = null;
      if (cardRes.status === 'fulfilled') {
        currentCard = (cardRes.value as CardResponse).card ?? null;
        setCard(currentCard);
      }
      let currentDraft: SourceDraftResponse['draft'] = null;
      if (draftRes.status === 'fulfilled') {
        currentDraft = (draftRes.value as SourceDraftResponse).draft ?? null;
        setDraft(currentDraft);
      }
      if (jobsRes.status === 'fulfilled') {
        const body = jobsRes.value as JobsResponse;
        setJobCount(body.count ?? 0);
        setLatestJob(body.jobs?.[0] ?? null); // adapter sorts newest-first
      }
      if (registryRes.status === 'fulfilled') {
        setRegistry((registryRes.value as unknown as { items?: RegistryItem[] }).items ?? []);
      }

      // Auto-populate source input if draft matches card
      if (currentCard && currentDraft?.source?.url) {
        const matches =
          currentDraft.product &&
          (currentDraft.product.shortLink === currentCard.shortLink ||
            (currentDraft.product.shopid === currentCard.shopId &&
              currentDraft.product.itemid === currentCard.itemId));
        if (matches) {
          setSourceUrlInput(currentDraft.source.url);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ---- Action 2 handlers ---------------------------------------------------
  const handleSaveSource = async () => {
    const trimmed = sourceUrlInput.trim();
    if (!trimmed) {
      setSourceError('Vui lòng dán link video nguồn.');
      return;
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      setSourceError('URL không hợp lệ — phải bắt đầu bằng http:// hoặc https://.');
      return;
    }
    if (trimmed.length > 3000) {
      setSourceError('URL quá dài (giới hạn 3000 ký tự).');
      return;
    }
    setSavingSource(true);
    setSourceNotice(null);
    setSourceError(null);
    try {
      const res = await fetch('/api/studio/create/source-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceKind: 'url', sourceUrl: trimmed }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        setSourceNotice('Nguồn đã được lưu thành công.');
        setDraft(body.draft);
        await load();
      } else {
        setSourceError(body.message || 'Lưu nguồn thất bại.');
      }
    } catch {
      setSourceError('Lỗi kết nối đến API server.');
    } finally {
      setSavingSource(false);
    }
  };

  const handleDeleteSource = async () => {
    setSavingSource(true);
    setSourceNotice(null);
    setSourceError(null);
    try {
      const res = await fetch('/api/studio/create/source-draft', { method: 'DELETE' });
      const body = await res.json();
      if (res.ok && body.ok) {
        setSourceNotice('Đã xóa nguồn nháp thành công.');
        setSourceUrlInput('');
        setDraft(null);
        await load();
      } else {
        setSourceError(body.message || 'Xóa nguồn thất bại.');
      }
    } catch {
      setSourceError('Lỗi kết nối đến API server.');
    } finally {
      setSavingSource(false);
    }
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmJobPhrase !== 'CREATE JOB') {
      setJobError('Cụm từ xác nhận không đúng. Cần nhập "CREATE JOB".');
      return;
    }
    setCreatingJob(true);
    setJobError(null);
    setJobCreatedSuccess(null);
    try {
      const res = await fetch('/api/studio/create/job-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmPhrase: confirmJobPhrase }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        setJobCreatedSuccess({
          jobId: body.jobId,
          status: body.status,
          productName: body.product?.name,
          sourceUrl: body.source?.url,
        });
        setConfirmJobPhrase('');
        setShowConfirmJob(false);
        setSourceUrlInput('');
        setDraft(null);
        await load();
      } else {
        setJobError(body.message || 'Tạo job thất bại.');
      }
    } catch {
      setJobError('Lỗi kết nối đến API server.');
    } finally {
      setCreatingJob(false);
    }
  };

  const handleRunSourceIntake = async (jobId: string) => {
    if (intakeConfirmInput !== 'RUN SOURCE INTAKE') {
      setActionError('Cụm từ xác nhận không khớp. Nhập đúng "RUN SOURCE INTAKE".');
      return;
    }
    setSubmittingIntake(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/studio/jobs/${jobId}/source-intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmPhrase: intakeConfirmInput }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setIntakeConfirmInput('');
        await load();
      } else {
        setActionError(data.message || 'Chạy tải / clean nguồn thất bại.');
      }
    } catch {
      setActionError('Lỗi kết nối đến API server.');
    } finally {
      setSubmittingIntake(false);
    }
  };

  const handleApproveCleanliness = async (jobId: string, status: 'pass' | 'fail') => {
    if (status === 'pass' && approveConfirmInput !== 'APPROVE SOURCE') {
      setActionError('Cụm từ xác nhận không khớp. Nhập đúng "APPROVE SOURCE".');
      return;
    }
    if (!cleanlinessNotes.trim()) {
      setActionError('Ghi chú là bắt buộc và không được để trống.');
      return;
    }
    setSubmittingApprove(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/studio/jobs/${jobId}/source-approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          notes: cleanlinessNotes,
          confirmPhrase: status === 'pass' ? approveConfirmInput : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setApproveConfirmInput('');
        setCleanlinessNotes('');
        await load();
      } else {
        setActionError(data.message || 'Xử lý duyệt nguồn sạch thất bại.');
      }
    } catch {
      setActionError('Lỗi kết nối đến API server.');
    } finally {
      setSubmittingApprove(false);
    }
  };

  // Round C3 — chạy pipeline sản xuất video (script→voice→BGM→render→caption→QA)
  const handleRunProduction = async (jobId: string, dryRun: boolean) => {
    if (!dryRun && runConfirmInput !== 'RUN PRODUCTION') {
      setActionError('Cụm từ xác nhận không khớp. Nhập đúng "RUN PRODUCTION".');
      return;
    }
    setSubmittingRun(true);
    setActionError(null);
    setRunNotice(null);
    setRunReport(null);
    try {
      const res = await fetch(`/api/studio/jobs/${jobId}/run-production`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dryRun ? { dryRun: true } : { confirmPhrase: runConfirmInput }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setRunConfirmInput('');
        setShowRunConfirm(false);
        setRunStage(data.status ?? null);
        setRunReport(data.reportSummary ?? null);
        setRunNotice(data.message ?? (dryRun ? 'Dry-run thành công.' : 'Đã khởi chạy sản xuất.'));
        if (!dryRun) setProductionLaunched(true);
        await load();
      } else {
        setRunStage(data.reasonCode ? `${data.status ?? 'FAILED'} · ${data.reasonCode}` : null);
        setRunReport(data.reportSummary ?? null);
        setActionError(data.message || 'Chạy sản xuất video thất bại.');
      }
    } catch {
      setActionError('Lỗi kết nối đến API server.');
    } finally {
      setSubmittingRun(false);
    }
  };

  // Poll job state trong lúc pipeline chạy nền cho tới khi tới trạng thái terminal.
  useEffect(() => {
    if (!productionLaunched) return;
    const terminal = ['READY_FOR_OPERATOR_REVIEW', 'APPROVED', 'PACKAGED', 'FAILED', 'REJECTED'];
    if (latestJob && terminal.includes(latestJob.state)) {
      setProductionLaunched(false);
      return;
    }
    const timer = setInterval(() => {
      load();
    }, 6000);
    return () => clearInterval(timer);
  }, [productionLaunched, latestJob, load]);

  // ---- Action 1 handlers ---------------------------------------------------
  const handlePromote = async (shortLink: string) => {
    setIsPromoting(shortLink);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const res = await fetch('/api/studio/commerce/shopee-card-from-registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortLink }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccessMessage(`Đã chọn sản phẩm: ${data.card.name}`);
        setImgError(false); // Reset image error for new image
        // Refresh current card
        const cardRes = await fetch('/api/studio/commerce/current-product-card').then((r) =>
          r.json(),
        );
        if (cardRes.ok) {
          setCard(cardRes.card);
        }
      } else {
        setErrorMessage(data.message || 'Lỗi promote sản phẩm.');
      }
    } catch {
      setErrorMessage('Không thể kết nối đến API server.');
    } finally {
      setIsPromoting('');
    }
  };

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmPhrase !== 'GET 1 SHOPEE LINK') {
      setErrorMessage('confirmPhrase không khớp. Nhập đúng "GET 1 SHOPEE LINK".');
      return;
    }
    setIsExtracting(true);
    setErrorMessage('');
    setSuccessMessage('');
    setExtractionResult(null);
    setHighlightShortLink('');
    try {
      const res = await fetch('/api/studio/commerce/shopee-extract-one-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmPhrase }),
      });
      const data = (await res.json()) as ExtractionResult;
      setExtractionResult(data);
      if (data.ok) {
        // Refresh registry picker so the new link shows up, then highlight it.
        // KHÔNG tạo job, KHÔNG render, KHÔNG publish — chỉ làm giàu kho link.
        const registryRes = await fetch('/api/studio/commerce/shopee-registry').then((r) =>
          r.json(),
        );
        if (registryRes.ok) {
          setRegistry(registryRes.items ?? []);
        }
        if (data.shortLink) setHighlightShortLink(data.shortLink);
        setConfirmPhrase('');
      }
      // SUSPENDED / FAIL: khu "Kết quả lấy link mới" hiển thị chi tiết + hướng dẫn,
      // không dùng banner đỏ gây hiểu nhầm là lỗi hệ thống.
    } catch {
      setErrorMessage('Lỗi hệ thống khi trích xuất.');
    } finally {
      setIsExtracting(false);
    }
  };

  // ---- derived gates -------------------------------------------------------
  const ownerOk = card?.ownerVerified ?? false;
  const cardReady = card !== null && ownerOk;

  // Draft only counts if it belongs to the CURRENT Product Card.
  const draftMatchesCard =
    !!draft?.source?.url &&
    !!card &&
    !!draft.product &&
    (draft.product.shortLink === card.shortLink ||
      (draft.product.shopid === card.shopId && draft.product.itemid === card.itemId));
  const sourceUrl = draftMatchesCard ? (draft?.source?.url ?? null) : null;

  const jobApproved =
    latestJob?.operatorDecision === 'APPROVED' ||
    latestJob?.state === 'APPROVED' ||
    latestJob?.state === 'PACKAGED';

  // Round C3 — production gates derived from real job state
  const sourceApproved = latestJob?.cleanlinessStatus === 'WATERMARK_NOT_DETECTED';
  const productionRunning =
    productionLaunched ||
    latestJob?.state === 'READY_TO_RENDER' ||
    latestJob?.state === 'RENDERING';
  const productionDone =
    latestJob?.state === 'READY_FOR_OPERATOR_REVIEW' ||
    latestJob?.state === 'APPROVED' ||
    latestJob?.state === 'PACKAGED';

  // Filter registry to verified items & latest 10
  const verifiedRegistryItems = registry.filter((item) => item.ownerVerified).slice(0, 10);

  return (
    <div className="space-y-6">
      <MockBanner />
      <PageHeader
        no={2}
        icon="products"
        accent="amber"
        title="Review Sản phẩm — Command Center"
        description="3 hành động vận hành: lấy sản phẩm → chạy sản xuất video → đăng bài. Bấm 1 nút, hệ thống điều phối chuỗi tác vụ ngầm."
      />

      <div className="flex items-center gap-2 rounded-xl border border-hairline bg-raised/30 px-3.5 py-2 text-[11px] text-neutral-400">
        <UtilIcon name="clock" width={13} height={13} className="text-neutral-500" />
        <span>
          <strong className="text-neutral-300">Action 1 & 2 đã wire.</strong> Action 1: kho link
          Shopee + trích xuất CDP. Action 2: nguồn → clean source → duyệt sạch → chạy sản xuất video
          (script→voice→BGM→render→caption→QA) ngay trong Command Center. Action 3 (đóng gói/đăng
          bài) tiếp tục wire ở round sau.
        </span>
      </div>

      {/* ===================== HÀNH ĐỘNG 1 ===================== */}
      <ActionPanel
        no={1}
        icon="products"
        accent="amber"
        title="Lấy / chọn sản phẩm"
        desc="Chọn sản phẩm affiliate đúng owner, hoặc lấy link Shopee mới — sẵn sàng thành Product Card."
        status={
          loading
            ? { label: 'Đang tải…', accent: 'blue' }
            : cardReady
              ? { label: 'Product Card sẵn sàng', accent: 'green' }
              : card
                ? { label: 'Sai owner', accent: 'rose' }
                : { label: 'Chưa có Product Card', accent: 'amber' }
        }
      >
        {card ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <div className="flex aspect-square w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-hairline bg-gradient-to-br from-raised to-panel">
              {card.productImageUrl && !imgError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.productImageUrl}
                  alt={card.name}
                  className="h-full w-full object-contain"
                  onError={() => setImgError(true)}
                />
              ) : (
                <Icon name="rawvisual" width={26} height={26} />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-sm font-semibold text-neutral-100">{card.name}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusChip accent={ownerOk ? 'green' : 'rose'}>
                  owner {ownerOk ? 'OK' : 'mismatch'}
                </StatusChip>
                {typeof card.score === 'number' && (
                  <StatusChip accent="cyan">score {card.score}/10</StatusChip>
                )}
                {card.commissionRate && (
                  <StatusChip accent="violet">hoa hồng {card.commissionRate}</StatusChip>
                )}
                {card.price && <StatusChip accent="blue">{card.price}</StatusChip>}
              </div>
              <p className="font-mono text-[10px] text-accent-blue break-all">{card.shortLink}</p>
            </div>
          </div>
        ) : (
          <NoticeBox accent="amber">
            Chưa có Product Card hiện tại. Vui lòng chọn bên dưới hoặc trích xuất link mới.
          </NoticeBox>
        )}

        {/* Success / Error alerts */}
        {successMessage && (
          <div className="rounded-lg border border-accent-green/30 bg-accent-green/10 p-3 text-xs text-accent-green flex items-start gap-2">
            <UtilIcon name="check" width={14} height={14} className="mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}
        {errorMessage && (
          <div className="rounded-lg border border-accent-rose/30 bg-accent-rose/10 p-3 text-xs text-accent-rose flex items-start gap-2">
            <UtilIcon name="clock" width={14} height={14} className="mt-0.5 rotate-45" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Compact Registry Picker */}
        {showRegistry && (
          <div className="space-y-3 rounded-lg border border-hairline bg-panel/60 p-3">
            <div className="flex items-center justify-between border-b border-hairline/60 pb-2">
              <span className="text-xs font-semibold text-neutral-200">
                Kho link Shopee (Verified)
              </span>
              <span className="text-[10px] text-neutral-400">
                Hiển thị {verifiedRegistryItems.length} link gần đây
              </span>
            </div>
            {verifiedRegistryItems.length === 0 ? (
              <p className="text-xs text-neutral-500 py-2">
                Không tìm thấy link verified nào trong registry.
              </p>
            ) : (
              <div className="divide-y divide-hairline/40 max-h-60 overflow-y-auto pr-1">
                {verifiedRegistryItems.map((item) => {
                  const isNew = highlightShortLink !== '' && item.shortLink === highlightShortLink;
                  return (
                    <div
                      key={item.shortLink}
                      className={`flex items-start justify-between py-2.5 gap-3 ${
                        isNew
                          ? 'rounded-md border border-accent-green/40 bg-accent-green/10 px-2'
                          : ''
                      }`}
                    >
                      <div className="flex gap-2.5 min-w-0 flex-1">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-hairline bg-gradient-to-br from-raised to-panel">
                          {item.productImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.productImageUrl}
                              alt={item.productName}
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <Icon name="rawvisual" width={16} height={16} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-xs font-medium text-neutral-200 truncate">
                            {isNew && (
                              <span className="mr-1 rounded border border-accent-green/30 bg-accent-green/20 px-1 text-[9px] align-middle text-accent-green">
                                Mới
                              </span>
                            )}
                            {item.productName}
                          </p>
                          <div className="flex flex-wrap gap-1 items-center">
                            {item.score !== undefined && (
                              <span className="rounded bg-cyan-950/40 text-cyan-400 border border-cyan-500/20 px-1 text-[9px]">
                                score {item.score}
                              </span>
                            )}
                            {item.commissionRate && (
                              <span className="rounded bg-violet-950/40 text-violet-400 border border-violet-500/20 px-1 text-[9px]">
                                {item.commissionRate}
                              </span>
                            )}
                            {item.price && (
                              <span className="rounded bg-blue-950/40 text-blue-400 border border-blue-500/20 px-1 text-[9px]">
                                {item.price}
                              </span>
                            )}
                            <span className="font-mono text-[9px] text-neutral-400 truncate max-w-[120px]">
                              {item.shortLink}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant={isPromoting === item.shortLink ? 'primary' : 'outline'}
                        disabled={isPromoting !== '' || isExtracting}
                        onClick={() => handlePromote(item.shortLink)}
                        className="shrink-0 !py-1 !px-2 text-[10px]"
                      >
                        {isPromoting === item.shortLink ? 'Đang chọn...' : 'Dùng sản phẩm này'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Shopee Link Extraction Intake Confirm Panel */}
        {showExtractor && (
          <div className="space-y-3 rounded-lg border border-accent-amber/20 bg-accent-amber/5 p-3">
            <div className="flex items-start gap-2 text-xs text-accent-amber">
              <span className="mt-0.5">⚠️</span>
              <div>
                <p className="font-semibold mb-1">Xác nhận trích xuất link Shopee mới qua CDP</p>
                <p className="text-[11px] text-neutral-300 leading-relaxed">
                  Hành động này sẽ attach vào Cốc Cốc/Shopee Affiliate đã đăng nhập và click đúng 1
                  nút “Lấy link”. Nếu gặp login/CAPTCHA/OTP, hệ thống sẽ dừng{' '}
                  <strong>SUSPENDED</strong> để Operator xử lý thủ công. Không tạo job, không
                  render, không publish.
                </p>
              </div>
            </div>

            <form
              onSubmit={handleExtract}
              className="flex flex-col gap-2.5 sm:flex-row sm:items-end"
            >
              <div className="flex-1 min-w-0">
                <label
                  htmlFor="confirmPhraseInput"
                  className="block text-[10px] text-neutral-400 font-medium mb-1"
                >
                  Nhập cụm xác nhận để chạy:{' '}
                  <code className="bg-neutral-800 px-1 py-0.5 rounded text-neutral-200">
                    GET 1 SHOPEE LINK
                  </code>
                  <span className="ml-1 text-neutral-500">
                    (đây là ô xác nhận, không phải ô link)
                  </span>
                </label>
                <input
                  id="confirmPhraseInput"
                  type="text"
                  required
                  disabled={isExtracting}
                  value={confirmPhrase}
                  onChange={(e) => setConfirmPhrase(e.target.value)}
                  placeholder="GET 1 SHOPEE LINK"
                  className="w-full rounded-lg border border-hairline bg-panel px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-accent-amber/50 disabled:opacity-50"
                />
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isExtracting}
                  onClick={() => {
                    setShowExtractor(false);
                    setConfirmPhrase('');
                    setExtractionResult(null);
                    setHighlightShortLink('');
                  }}
                  className="!py-1.5 !px-2.5 text-[11px]"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  variant="success"
                  disabled={isExtracting || confirmPhrase !== 'GET 1 SHOPEE LINK'}
                  className="!py-1.5 !px-2.5 text-[11px] bg-accent-amber/80 hover:bg-accent-amber text-neutral-900 border-none font-semibold disabled:opacity-30 disabled:bg-accent-amber/20 disabled:text-neutral-500"
                >
                  {isExtracting ? (
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-3 animate-spin rounded-full border border-neutral-900 border-t-transparent" />
                      Đang trích xuất...
                    </span>
                  ) : (
                    'Xác nhận & Chạy'
                  )}
                </Button>
              </div>
            </form>

            {/* ===== Khu kết quả lấy link mới (tách riêng khỏi ô xác nhận) ===== */}
            {extractionResult && (
              <ExtractionResultBox
                result={extractionResult}
                inRegistry={
                  !!extractionResult.shortLink &&
                  registry.some((i) => i.shortLink === extractionResult.shortLink)
                }
                isPromoting={isPromoting === extractionResult.shortLink}
                promoteDisabled={isPromoting !== '' || isExtracting}
                onUseProduct={() => {
                  if (extractionResult.shortLink) handlePromote(extractionResult.shortLink);
                }}
              />
            )}
          </div>
        )}

        <PanelActions>
          <Button
            onClick={() => {
              setShowRegistry(!showRegistry);
              setShowExtractor(false);
            }}
            className={
              showRegistry
                ? 'bg-accent-amber/20 text-accent-amber border-accent-amber/40 font-semibold'
                : ''
            }
          >
            <Icon name="products" width={12} height={12} className="mr-1" />
            {showRegistry ? 'Ẩn kho link' : 'Chọn từ kho link (no-click)'}
          </Button>
          <Button
            onClick={() => {
              setShowExtractor(!showExtractor);
              setShowRegistry(false);
            }}
            className={
              showExtractor
                ? 'bg-accent-amber/20 text-accent-amber border-accent-amber/40 font-semibold'
                : ''
            }
          >
            <UtilIcon name="sparkle" width={12} height={12} />
            {showExtractor ? 'Ẩn trích xuất' : 'Lấy link Shopee mới'}
          </Button>
          <DebugLink href="/products?lane=product-review">Mở kho sản phẩm (debug)</DebugLink>
        </PanelActions>

        <GateHint
          ok={cardReady}
          okText="Product Card hợp lệ → mở Hành động 2"
          waitText="Cần Product Card đúng owner để mở Hành động 2"
        />
      </ActionPanel>

      {/* ===================== HÀNH ĐỘNG 2 ===================== */}
      <ActionPanel
        no={2}
        icon="create"
        accent="violet"
        title="Chạy sản xuất video"
        desc="Dán link video nguồn → 1 nút điều phối: tải/clean nguồn → script → voice → BGM → render → caption → QA → preview."
        status={
          loading
            ? { label: 'Đang tải…', accent: 'blue' }
            : !cardReady
              ? { label: 'Khoá — cần sản phẩm', accent: 'amber' }
              : latestJob
                ? { label: latestJob.statusLabel, accent: latestJob.statusAccent }
                : { label: 'Chưa có job', accent: 'blue' }
        }
        locked={!cardReady}
        lockReason="Hoàn tất Hành động 1 (Product Card hợp lệ) để mở bước sản xuất."
      >
        {/* Nguồn video */}
        <div className="rounded-lg border border-hairline bg-raised/30 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              Nguồn video
            </span>
            {draftMatchesCard && (
              <span className="text-[10px] text-accent-green font-medium">
                ✓ Đã khớp Product Card
              </span>
            )}
          </div>

          <div className="space-y-2">
            <input
              type="url"
              disabled={savingSource || creatingJob}
              value={sourceUrlInput}
              onChange={(e) => setSourceUrlInput(e.target.value)}
              placeholder="https://... URL video nguồn (TikTok, Douyin, ...)"
              className="w-full rounded-lg border border-hairline bg-panel/80 px-3 py-2 text-xs text-neutral-100 outline-none focus:border-accent-violet disabled:opacity-50"
            />
            {sourceUrlInput.trim().length > 0 && !/^https?:\/\//i.test(sourceUrlInput.trim()) && (
              <p className="text-[10px] text-accent-rose">
                URL không hợp lệ — phải bắt đầu bằng http:// hoặc https://
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                className="!py-1 !px-2.5 text-[10px] font-semibold"
                onClick={handleSaveSource}
                disabled={
                  savingSource ||
                  creatingJob ||
                  !sourceUrlInput.trim() ||
                  !/^https?:\/\//i.test(sourceUrlInput.trim())
                }
              >
                {savingSource ? 'Đang lưu...' : 'Lưu nguồn'}
              </Button>
              {draftMatchesCard && (
                <Button
                  variant="outline"
                  className="!py-1 !px-2.5 text-[10px] font-semibold"
                  onClick={handleDeleteSource}
                  disabled={savingSource || creatingJob}
                >
                  Xóa nguồn
                </Button>
              )}
            </div>

            {sourceNotice && <p className="text-[10px] text-accent-green">{sourceNotice}</p>}
            {sourceError && <p className="text-[10px] text-accent-rose">{sourceError}</p>}
            {!draftMatchesCard && draft?.source?.url && (
              <NoticeBox accent="amber">
                Có draft nguồn của sản phẩm khác — không áp cho Product Card hiện tại.
              </NoticeBox>
            )}
          </div>
        </div>

        {/* Chuẩn bị job sản xuất / Xác nhận */}
        {draftMatchesCard && (
          <div className="rounded-lg border border-hairline bg-raised/30 p-3 space-y-2.5">
            {!showConfirmJob ? (
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-neutral-400">
                  Nguồn video nháp đã sẵn sàng. Tạo job draft để bắt đầu quy trình sản xuất.
                </p>
                <Button
                  onClick={() => {
                    setShowConfirmJob(true);
                    setConfirmJobPhrase('');
                    setJobError(null);
                  }}
                  variant="success"
                  className="!py-1.5 !px-3 text-[11px] bg-accent-violet hover:bg-accent-violet/90 text-white font-semibold shrink-0"
                >
                  Chuẩn bị job sản xuất
                </Button>
              </div>
            ) : (
              <form onSubmit={handleCreateJob} className="space-y-2.5">
                <div className="flex items-start gap-2 text-xs text-accent-violet">
                  <span className="mt-0.5">ℹ️</span>
                  <div>
                    <p className="font-semibold text-neutral-200">Xác nhận tạo Job Draft</p>
                    <p className="text-[11px] text-neutral-400 leading-relaxed">
                      Hệ thống sẽ khởi tạo Job Draft từ Product Card và nguồn video nháp. Bạn cần gõ
                      cụm xác nhận.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
                  <div className="flex-1 min-w-0">
                    <label
                      htmlFor="confirmJobPhraseInput"
                      className="block text-[10px] text-neutral-400 font-medium mb-1"
                    >
                      Gõ chính xác:{' '}
                      <code className="bg-neutral-800 px-1 py-0.5 rounded text-neutral-200 font-mono select-all">
                        CREATE JOB
                      </code>
                    </label>
                    <input
                      id="confirmJobPhraseInput"
                      type="text"
                      required
                      disabled={creatingJob}
                      value={confirmJobPhrase}
                      onChange={(e) => setConfirmJobPhrase(e.target.value)}
                      placeholder="CREATE JOB"
                      className="w-full rounded-lg border border-hairline bg-panel px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-accent-violet disabled:opacity-50"
                    />
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={creatingJob}
                      onClick={() => {
                        setShowConfirmJob(false);
                        setConfirmJobPhrase('');
                        setJobError(null);
                      }}
                      className="!py-1.5 !px-2.5 text-[11px]"
                    >
                      Hủy
                    </Button>
                    <Button
                      type="submit"
                      variant="success"
                      disabled={creatingJob || confirmJobPhrase !== 'CREATE JOB'}
                      className="!py-1.5 !px-3 text-[11px] bg-accent-violet hover:bg-accent-violet text-white border-none font-semibold disabled:opacity-30"
                    >
                      {creatingJob ? 'Đang tạo...' : 'Xác nhận tạo'}
                    </Button>
                  </div>
                </div>
              </form>
            )}

            {jobError && <p className="text-[11px] text-accent-rose">Lỗi: {jobError}</p>}
          </div>
        )}

        {/* Job Created Success Box */}
        {jobCreatedSuccess && (
          <div className="rounded-lg border border-accent-green/30 bg-accent-green/10 p-3 space-y-2 text-xs">
            <p className="font-semibold text-accent-green">✅ Job đã tạo thành công!</p>
            <div className="space-y-1 font-mono text-[11px] text-neutral-300">
              <div>
                jobId: <span className="text-accent-blue font-bold">{jobCreatedSuccess.jobId}</span>
              </div>
              <div>
                status:{' '}
                <span className="text-accent-amber font-semibold">{jobCreatedSuccess.status}</span>
              </div>
              {jobCreatedSuccess.sourceUrl && (
                <div className="break-all">
                  source URL:{' '}
                  <span className="text-neutral-400">{jobCreatedSuccess.sourceUrl}</span>
                </div>
              )}
              {jobCreatedSuccess.productName && (
                <div>
                  Product Card:{' '}
                  <span className="text-neutral-200">{jobCreatedSuccess.productName}</span>
                </div>
              )}
            </div>
            <Button
              onClick={() => setJobCreatedSuccess(null)}
              variant="outline"
              className="!py-1 !px-2 text-[10px]"
            >
              Đóng thông báo
            </Button>
          </div>
        )}

        {/* Job mới nhất */}
        <div className="rounded-lg border border-hairline bg-raised/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              Job mới nhất{' '}
              {jobCount > 0 && <span className="text-neutral-600">· {jobCount} job</span>}
            </p>
            {latestJob && (
              <span className="font-mono text-[10px] text-neutral-500">{latestJob.id}</span>
            )}
          </div>

          {latestJob ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusChip accent={latestJob.statusAccent}>{latestJob.statusLabel}</StatusChip>
                {latestJob.duration !== '—' && (
                  <StatusChip accent="blue">{latestJob.duration}</StatusChip>
                )}
                {latestJob.hasPreview && <StatusChip accent="green">có preview</StatusChip>}
              </div>

              {latestJob.errorLog && (
                <NoticeBox accent="rose">Lỗi: {latestJob.errorLog.error}</NoticeBox>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-neutral-500">
              Chưa có job nào trong lane. Tiến hành dán nguồn và tạo job để bắt đầu.
            </p>
          )}
        </div>

        {/* Bước 2 — Tải / clean nguồn */}
        {latestJob && (
          <div className="rounded-lg border border-hairline bg-raised/30 p-3 space-y-3">
            <div className="flex items-center justify-between border-b border-hairline/60 pb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                Bước 2 — Tải / clean nguồn
              </span>
              {latestJob.cleanlinessStatus && (
                <StatusChip
                  accent={
                    latestJob.cleanlinessStatus === 'WATERMARK_NOT_DETECTED'
                      ? 'green'
                      : latestJob.cleanlinessStatus === 'WATERMARK_DETECTED'
                        ? 'rose'
                        : 'amber'
                  }
                >
                  {latestJob.cleanlinessStatus === 'WATERMARK_NOT_DETECTED'
                    ? 'Nguồn sạch'
                    : latestJob.cleanlinessStatus === 'WATERMARK_DETECTED'
                      ? 'Bị từ chối'
                      : 'Chờ duyệt'}
                </StatusChip>
              )}
            </div>

            {actionError && (
              <div className="rounded-lg border border-accent-rose/30 bg-accent-rose/10 p-2.5 text-xs text-accent-rose">
                Lỗi: {actionError}
              </div>
            )}

            {/* Case 1: Waiting for download / failed to download */}
            {(latestJob.state === 'WAITING_FOR_SOURCE_VIDEO' ||
              (latestJob.state === 'FAILED' && !latestJob.cleanlinessStatus)) && (
              <div className="space-y-2.5">
                <p className="text-xs text-neutral-400">
                  Video nguồn chưa được tải hoặc tải lỗi. Tiến hành tải và phân tích frame sạch:
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1 min-w-0">
                    <label
                      htmlFor="intakeConfirmInput"
                      className="block text-[10px] text-neutral-400 font-medium mb-1"
                    >
                      Nhập cụm xác nhận để chạy:{' '}
                      <code className="bg-neutral-800 px-1 py-0.5 rounded text-neutral-200">
                        RUN SOURCE INTAKE
                      </code>
                    </label>
                    <input
                      id="intakeConfirmInput"
                      type="text"
                      required
                      disabled={submittingIntake}
                      value={intakeConfirmInput}
                      onChange={(e) => setIntakeConfirmInput(e.target.value)}
                      placeholder="RUN SOURCE INTAKE"
                      className="w-full rounded-lg border border-hairline bg-panel px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-accent-violet disabled:opacity-50"
                    />
                  </div>
                  <Button
                    onClick={() => handleRunSourceIntake(latestJob.id)}
                    variant="success"
                    disabled={submittingIntake || intakeConfirmInput !== 'RUN SOURCE INTAKE'}
                    className="!py-1.5 !px-3.5 text-[11px] bg-accent-violet hover:bg-accent-violet text-white border-none font-semibold shrink-0 disabled:opacity-30"
                  >
                    {submittingIntake ? (
                      <span className="flex items-center gap-1.5">
                        <span className="h-3 w-3 animate-spin rounded-full border border-neutral-950 border-t-transparent" />
                        Đang chạy tải...
                      </span>
                    ) : (
                      'Tải & Clean nguồn'
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Case 2: Needs Operator Review (NEEDS_REVIEW or UNKNOWN_NEEDS_OPERATOR_REVIEW) */}
            {(latestJob.cleanlinessStatus === 'NEEDS_REVIEW' ||
              latestJob.cleanlinessStatus === 'UNKNOWN_NEEDS_OPERATOR_REVIEW') && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-neutral-300">
                  Rà soát hình ảnh (5 frame trích xuất) để kiểm tra watermark/logo:
                </p>

                {/* Grid of 5 frame thumbnails */}
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((index) => (
                    <div
                      key={index}
                      className="group relative aspect-video overflow-hidden rounded border border-hairline bg-neutral-900 transition hover:border-neutral-500"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/studio/jobs/${latestJob.id}/source-frame/${index}`}
                        alt={`Review frame ${index}`}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                      <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[8px] font-mono text-neutral-300">
                        F{index}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <div>
                    <label
                      htmlFor="cleanlinessNotes"
                      className="block text-[10px] text-neutral-400 font-medium mb-1"
                    >
                      Ghi chú Operator <span className="text-accent-rose">*</span>
                    </label>
                    <textarea
                      id="cleanlinessNotes"
                      required
                      rows={2}
                      disabled={submittingApprove}
                      value={cleanlinessNotes}
                      onChange={(e) => setCleanlinessNotes(e.target.value)}
                      placeholder="Nhập ghi chú rà soát (ví dụ: Video sạch không logo, hoặc Phát hiện logo watermark ở góc dưới)..."
                      className="w-full rounded-lg border border-hairline bg-panel px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-accent-violet disabled:opacity-50"
                    />
                  </div>

                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
                    <div className="flex-1 min-w-0">
                      <label
                        htmlFor="approveConfirmInput"
                        className="block text-[10px] text-neutral-400 font-medium mb-1"
                      >
                        Gõ để duyệt sạch:{' '}
                        <code className="bg-neutral-800 px-1 py-0.5 rounded text-neutral-200">
                          APPROVE SOURCE
                        </code>
                      </label>
                      <input
                        id="approveConfirmInput"
                        type="text"
                        disabled={submittingApprove}
                        value={approveConfirmInput}
                        onChange={(e) => setApproveConfirmInput(e.target.value)}
                        placeholder="APPROVE SOURCE"
                        className="w-full rounded-lg border border-hairline bg-panel px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-accent-violet disabled:opacity-50"
                      />
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        onClick={() => handleApproveCleanliness(latestJob.id, 'fail')}
                        variant="outline"
                        disabled={submittingApprove || !cleanlinessNotes.trim()}
                        className="!py-1.5 !px-3 text-[11px] border-accent-rose hover:bg-accent-rose/10 text-accent-rose font-semibold disabled:opacity-30"
                      >
                        {submittingApprove ? 'Từ chối...' : 'Từ chối nguồn'}
                      </Button>
                      <Button
                        onClick={() => handleApproveCleanliness(latestJob.id, 'pass')}
                        variant="success"
                        disabled={
                          submittingApprove ||
                          !cleanlinessNotes.trim() ||
                          approveConfirmInput !== 'APPROVE SOURCE'
                        }
                        className="!py-1.5 !px-3 text-[11px] bg-accent-green hover:bg-accent-green/90 text-neutral-900 border-none font-semibold disabled:opacity-30"
                      >
                        {submittingApprove ? 'Đang duyệt...' : 'Duyệt nguồn sạch'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Case 3: Watermark Not Detected (Clean) */}
            {latestJob.cleanlinessStatus === 'WATERMARK_NOT_DETECTED' && (
              <div className="space-y-2">
                <p className="text-xs text-accent-green flex items-center gap-1 font-semibold">
                  <span>✓</span> Nguồn video đã được duyệt sạch (Không phát hiện logo/watermark).
                </p>
                {latestJob.notes && (
                  <div className="rounded-lg border border-hairline/60 bg-panel/30 p-2.5 text-xs text-neutral-300 leading-relaxed">
                    <span className="font-semibold text-neutral-400">Ghi chú duyệt:</span>{' '}
                    {latestJob.notes}
                  </div>
                )}
              </div>
            )}

            {/* Case 4: Watermark Detected (Rejected) */}
            {latestJob.cleanlinessStatus === 'WATERMARK_DETECTED' && (
              <div className="space-y-2">
                <p className="text-xs text-accent-rose flex items-center gap-1 font-semibold">
                  <span>✗</span> Nguồn video bị từ chối (Phát hiện logo/watermark).
                </p>
                {latestJob.notes && (
                  <div className="rounded-lg border border-accent-rose/30 bg-accent-rose/10 p-2.5 text-xs text-accent-rose leading-relaxed">
                    <span className="font-semibold text-neutral-400">Ghi chú từ chối:</span>{' '}
                    {latestJob.notes}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Pipeline Checklist */}
        <div className="rounded-lg border border-hairline bg-raised/30 p-3 space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            Pipeline Checklist
          </p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            <StepRow
              label="1. Nguồn video"
              state={latestJob || draftMatchesCard ? 'pass' : 'warn'}
            />
            <StepRow
              label="2. Tải / clean nguồn"
              state={latestJob ? latestJob.pipeline.source : 'warn'}
            />
            <StepRow label="3. Script" state={latestJob ? latestJob.pipeline.script : 'warn'} />
            <StepRow label="4. Voice" state={latestJob ? latestJob.pipeline.voice : 'warn'} />
            <StepRow label="5. BGM" state={latestJob ? latestJob.pipeline.bgm : 'warn'} />
            <StepRow
              label="6. Render + caption"
              state={latestJob ? latestJob.pipeline.render : 'warn'}
            />
            <StepRow label="7. QA / Kiểm tra" state={latestJob ? latestJob.pipeline.qa : 'warn'} />
          </div>
        </div>

        {/* Bước 3–7 — Chạy sản xuất video (Round C3) */}
        <div className="rounded-lg border border-hairline bg-raised/30 p-3 space-y-3">
          <div className="flex items-center justify-between border-b border-hairline/60 pb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              Bước 3–7 — Sản xuất video (Script · Voice · BGM · Render · QA)
            </span>
            {runStage && <span className="font-mono text-[10px] text-neutral-400">{runStage}</span>}
          </div>

          {/* QA result inline — QA luôn nằm TRONG Action 2 */}
          {latestJob?.qaStatus && (
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusChip
                accent={
                  latestJob.qaStatus === 'PASS'
                    ? 'green'
                    : latestJob.qaStatus === 'FAIL'
                      ? 'rose'
                      : 'amber'
                }
              >
                QA: {latestJob.qaStatus}
              </StatusChip>
              {latestJob.hasPreview && <StatusChip accent="green">có preview</StatusChip>}
            </div>
          )}

          {!latestJob ? (
            <p className="text-[11px] text-neutral-500">
              Tạo job + duyệt nguồn sạch (Bước 1–2) để mở bước sản xuất.
            </p>
          ) : !sourceApproved ? (
            <NoticeBox accent="amber">
              Cần duyệt nguồn sạch (Bước 2 → WATERMARK_NOT_DETECTED) trước khi chạy sản xuất video.
            </NoticeBox>
          ) : productionDone ? (
            <div className="space-y-2">
              <p className="flex items-center gap-1 text-xs font-semibold text-accent-green">
                <span>✓</span> Video đã sản xuất — {latestJob.statusLabel}.
              </p>
              {latestJob.previewUrl && (
                <a
                  href={latestJob.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-[11px] text-accent-blue underline"
                >
                  Mở preview video
                </a>
              )}
              <div className="pt-1">
                <Button
                  variant="outline"
                  className="!py-1 !px-2.5 text-[10px]"
                  onClick={() => load()}
                  disabled={loading}
                >
                  Làm mới trạng thái
                </Button>
              </div>
            </div>
          ) : productionRunning ? (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-accent-cyan">
                <span className="h-3 w-3 animate-spin rounded-full border border-accent-cyan border-t-transparent" />
                Đang sản xuất video… (script → voice → BGM → render → caption → QA)
              </p>
              <p className="text-[10px] text-neutral-500">
                Pipeline chạy nền vài phút. Trạng thái tự cập nhật, hoặc bấm làm mới.
              </p>
              <Button
                variant="outline"
                className="!py-1 !px-2.5 text-[10px]"
                onClick={() => load()}
                disabled={loading}
              >
                Làm mới trạng thái
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-xs text-neutral-400">
                Nguồn đã duyệt sạch. Chạy pipeline sản xuất từ clean source đã duyệt (không nhảy
                route kỹ thuật).
              </p>
              {!showRunConfirm ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="success"
                    className="!py-1.5 !px-3 text-[11px] bg-accent-violet hover:bg-accent-violet text-white border-none font-semibold"
                    onClick={() => {
                      setShowRunConfirm(true);
                      setRunConfirmInput('');
                      setActionError(null);
                    }}
                    disabled={submittingRun}
                  >
                    Chạy sản xuất video
                  </Button>
                  <Button
                    variant="outline"
                    className="!py-1.5 !px-3 text-[11px]"
                    onClick={() => handleRunProduction(latestJob.id, true)}
                    disabled={submittingRun}
                  >
                    {submittingRun ? 'Đang chạy thử…' : 'Chạy thử (dry-run)'}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
                  <div className="flex-1 min-w-0">
                    <label
                      htmlFor="runConfirmInput"
                      className="block text-[10px] text-neutral-400 font-medium mb-1"
                    >
                      Nhập cụm xác nhận để chạy:{' '}
                      <code className="bg-neutral-800 px-1 py-0.5 rounded text-neutral-200">
                        RUN PRODUCTION
                      </code>
                    </label>
                    <input
                      id="runConfirmInput"
                      type="text"
                      required
                      disabled={submittingRun}
                      value={runConfirmInput}
                      onChange={(e) => setRunConfirmInput(e.target.value)}
                      placeholder="RUN PRODUCTION"
                      className="w-full rounded-lg border border-hairline bg-panel px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-accent-violet disabled:opacity-50"
                    />
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={submittingRun}
                      onClick={() => {
                        setShowRunConfirm(false);
                        setRunConfirmInput('');
                        setActionError(null);
                      }}
                      className="!py-1.5 !px-2.5 text-[11px]"
                    >
                      Hủy
                    </Button>
                    <Button
                      variant="success"
                      disabled={submittingRun || runConfirmInput !== 'RUN PRODUCTION'}
                      onClick={() => handleRunProduction(latestJob.id, false)}
                      className="!py-1.5 !px-3 text-[11px] bg-accent-violet hover:bg-accent-violet text-white border-none font-semibold disabled:opacity-30"
                    >
                      {submittingRun ? 'Đang khởi chạy…' : 'Xác nhận chạy'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {runNotice && <p className="text-[10px] text-accent-green">{runNotice}</p>}
          {runReport && (
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded border border-hairline/60 bg-panel/40 p-2 text-[9px] leading-relaxed text-neutral-400">
              {runReport}
            </pre>
          )}

          <PanelActions>
            <DebugLink href="/render?lane=product-review">Xem tiến độ render (debug)</DebugLink>
            <DebugLink href="/qa?lane=product-review">Xem QA (debug)</DebugLink>
          </PanelActions>
        </div>

        <GateHint
          ok={!!jobApproved}
          okText="Job đã APPROVED → mở Hành động 3"
          waitText="Job cần đạt READY_FOR_OPERATOR_REVIEW + QA PASS rồi Operator duyệt"
        />
      </ActionPanel>

      {/* ===================== HÀNH ĐỘNG 3 ===================== */}
      <ActionPanel
        no={3}
        icon="publish"
        accent="blue"
        title="Đăng bài / Đóng gói"
        desc="Đóng gói video duyệt + caption + affiliate link + CTA, kèm hướng dẫn tự đăng. Live publish Facebook có gate cứng."
        status={
          loading
            ? { label: 'Đang tải…', accent: 'blue' }
            : jobApproved
              ? { label: 'Sẵn sàng đóng gói', accent: 'green' }
              : { label: 'Khoá — chờ duyệt', accent: 'amber' }
        }
        locked={!jobApproved}
        lockReason="Cần job đã APPROVED (QA PASS + Operator duyệt preview) để mở bước đóng gói."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <PackItem
            label="Video đã duyệt"
            ok={!!latestJob?.hasPreview && !!jobApproved}
            mutedText="chờ preview duyệt"
          />
          <PackItem label="Caption / hashtags" ok={false} mutedText="đóng gói ở Round E" />
          <PackItem
            label="Affiliate link hợp lệ"
            ok={latestJob?.pipeline.affiliateLink === 'pass'}
            mutedText="kiểm owner khi đóng gói"
          />
          <PackItem label="CTA multi-touch" ok={false} mutedText="mock — nối sau" />
        </div>

        <PanelActions>
          <ComingNext round="E" primary>
            Đóng gói package
          </ComingNext>
          <ComingNext round="E" warn>
            Live Publish Facebook (gate cứng)
          </ComingNext>
          <DebugLink href="/publish?lane=product-review">Mở publish (debug)</DebugLink>
        </PanelActions>

        <GateHint
          ok={latestJob?.state === 'PACKAGED'}
          okText="Đã đóng gói (PACKAGED) — sẵn sàng đăng thủ công"
          waitText="Hoàn tất khi PACKAGED (thủ công) hoặc PUBLISHED (nếu Operator chủ động live)"
        />
      </ActionPanel>
    </div>
  );
}

/* =============================================================================
 * Local presentational helpers — chỉ dùng trong trang này (không over-abstract).
 * ========================================================================== */

function ActionPanel({
  no,
  icon,
  accent,
  title,
  desc,
  status,
  locked = false,
  lockReason,
  children,
}: {
  no: number;
  icon: 'products' | 'create' | 'publish';
  accent: AccentKey;
  title: string;
  desc: string;
  status: { label: string; accent: AccentKey };
  locked?: boolean;
  lockReason?: string;
  children: ReactNode;
}) {
  return (
    <Card className={locked ? 'opacity-95' : ''}>
      <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ACCENT_BG_SOFT[accent]}`}
          >
            <Icon name={icon} width={20} height={20} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold tracking-wider text-neutral-500">
                HÀNH ĐỘNG {no}
              </span>
            </div>
            <h2 className="text-sm font-bold text-neutral-100">{title}</h2>
            <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-neutral-500">{desc}</p>
          </div>
        </div>
        <StatusChip accent={status.accent}>{status.label}</StatusChip>
      </div>

      <div className="space-y-3 px-5 py-4">
        {locked && lockReason && (
          <div className="flex items-center gap-2 rounded-lg border border-neutral-700/50 bg-neutral-800/30 px-3 py-2 text-[11px] text-neutral-400">
            <UtilIcon name="clock" width={13} height={13} className="text-neutral-500" />
            <span>
              <strong className="text-neutral-300">Khoá.</strong> {lockReason}
            </span>
          </div>
        )}
        <div className={locked ? 'pointer-events-none select-none opacity-50' : ''}>
          <div className="space-y-3">{children}</div>
        </div>
      </div>
    </Card>
  );
}

function StatusChip({ accent, children }: { accent: AccentKey; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${ACCENT_BG_SOFT[accent]}`}
    >
      {children}
    </span>
  );
}

const GATE_DOT: Record<GateState, string> = {
  pass: 'bg-accent-green',
  fail: 'bg-accent-rose',
  warn: 'bg-neutral-600',
};

function StepRow({ label, state }: { label: string; state: GateState }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-hairline/60 bg-panel/40 px-2.5 py-1.5">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${GATE_DOT[state]}`} />
      <span
        className={`truncate text-[11px] ${state === 'pass' ? 'text-neutral-200' : 'text-neutral-500'}`}
      >
        {label}
      </span>
    </div>
  );
}

function PackItem({ label, ok, mutedText }: { label: string; ok: boolean; mutedText: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-hairline/60 bg-panel/40 px-2.5 py-1.5 text-[11px]">
      <span className={ok ? 'text-neutral-200' : 'text-neutral-500'}>{label}</span>
      {ok ? (
        <span className="flex items-center gap-1 text-accent-green">
          <UtilIcon name="check" width={11} height={11} /> OK
        </span>
      ) : (
        <span className="text-neutral-600">{mutedText}</span>
      )}
    </div>
  );
}

function PanelActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 pt-1">{children}</div>;
}

/** Nút disabled cho hành động chưa wire — nói rõ sẽ làm ở round nào. */
function ComingNext({
  round,
  children,
  primary = false,
  warn = false,
}: {
  round: string;
  children: ReactNode;
  primary?: boolean;
  warn?: boolean;
}) {
  return (
    <Button
      variant={primary ? 'primary' : 'outline'}
      disabled
      title={`Chưa wire — sẽ làm ở Round ${round}`}
      className="!py-1.5 !px-2.5 text-[11px]"
    >
      {warn && <span className="text-accent-amber">⚠</span>}
      {children}
      <span className="ml-1 rounded bg-neutral-700/60 px-1 py-0.5 font-mono text-[9px] text-neutral-400">
        Round {round}
      </span>
    </Button>
  );
}

/** Link nhỏ tới route kỹ thuật cũ — chỉ là debug/detail, không phải flow chính. */
function DebugLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 rounded-lg border border-hairline/60 bg-raised/20 px-2.5 py-1.5 text-[11px] text-neutral-400 transition hover:bg-raised/60 hover:text-neutral-200"
    >
      {children}
      <UtilIcon name="chevron" width={11} height={11} />
    </a>
  );
}

function GateHint({ ok, okText, waitText }: { ok: boolean; okText: string; waitText: string }) {
  const accentText = ok ? ACCENT_TEXT.green : 'text-neutral-500';
  return (
    <div
      className={`flex items-center gap-1.5 border-t border-hairline/50 pt-2.5 text-[11px] ${accentText}`}
    >
      <UtilIcon name={ok ? 'check' : 'clock'} width={12} height={12} />
      <span>{ok ? okText : waitText}</span>
    </div>
  );
}

function NoticeBox({ accent, children }: { accent: 'amber' | 'rose'; children: ReactNode }) {
  const cls =
    accent === 'amber'
      ? 'border-accent-amber/30 bg-accent-amber/10 text-accent-amber'
      : 'border-accent-rose/30 bg-accent-rose/10 text-accent-rose';
  return <div className={`rounded-lg border px-3 py-2 text-[11px] ${cls}`}>{children}</div>;
}

/** Một dòng nhãn: giá trị trong khu kết quả lấy link. */
function ResultRow({
  label,
  value,
  mono = false,
}: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd
        className={`text-right break-all text-neutral-200 ${mono ? 'font-mono text-[10px]' : ''}`}
      >
        {value ?? '—'}
      </dd>
    </div>
  );
}

/**
 * Khu hiển thị kết quả của /api/studio/commerce/shopee-extract-one-link.
 * TÁCH RIÊNG khỏi ô nhập cụm xác nhận để Operator không nhầm ô confirm với ô link.
 * SUCCESS → chi tiết link + nút dùng sản phẩm. SUSPENDED → hướng dẫn xử lý tay.
 * FAIL → message đã sanitize từ API. KHÔNG tạo job / render / publish.
 */
function ExtractionResultBox({
  result,
  inRegistry,
  isPromoting,
  promoteDisabled,
  onUseProduct,
}: {
  result: ExtractionResult;
  inRegistry: boolean;
  isPromoting: boolean;
  promoteDisabled: boolean;
  onUseProduct: () => void;
}) {
  return (
    <div className="space-y-2.5 rounded-lg border border-hairline bg-panel/60 p-3">
      <div className="flex items-center justify-between border-b border-hairline/60 pb-2">
        <span className="text-xs font-semibold text-neutral-200">Kết quả lấy link mới</span>
        <span className="font-mono text-[9px] text-neutral-500">shopee-extract-one-link</span>
      </div>

      {result.status === 'SUCCESS' ? (
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-accent-green">✅ Đã lấy link Shopee mới</p>

          <dl className="space-y-1.5 text-[11px]">
            <ResultRow label="Tên sản phẩm" value={result.productName} />
            <ResultRow label="Short link" value={result.shortLink} mono />
            <ResultRow
              label="shopid / itemid"
              value={
                result.shopid && result.itemid ? `${result.shopid} / ${result.itemid}` : undefined
              }
              mono
            />
          </dl>

          <div className="flex flex-wrap items-center gap-1.5">
            <StatusChip accent={result.ownerVerified ? 'green' : 'rose'}>
              owner {result.ownerVerified ? 'OK' : 'mismatch'}
            </StatusChip>
            <StatusChip accent={result.inserted ? 'green' : result.duplicate ? 'blue' : 'amber'}>
              {result.inserted
                ? 'mới thêm registry'
                : result.duplicate
                  ? 'đã có sẵn (duplicate)'
                  : 'không thay đổi registry'}
            </StatusChip>
            <StatusChip accent={result.productImageCaptured ? 'green' : 'amber'}>
              ảnh {result.productImageCaptured ? 'đã chụp' : 'chưa có'}
            </StatusChip>
          </div>

          <p className="text-[10px] text-neutral-500">
            Owner mong đợi:{' '}
            <span className="font-mono text-neutral-300">
              {result.expectedOwner ?? 'an_17376660568'}
            </span>
          </p>

          {inRegistry && result.shortLink && (
            <Button
              variant="success"
              disabled={promoteDisabled}
              onClick={onUseProduct}
              className="!py-1.5 !px-3 text-[11px]"
            >
              {isPromoting ? 'Đang chọn...' : 'Dùng sản phẩm này'}
            </Button>
          )}

          <p className="border-t border-hairline/40 pt-2 text-[10px] leading-relaxed text-neutral-500">
            Link mới đã lưu vào kho link và được đánh dấu “Mới” trong picker. KHÔNG tạo job, KHÔNG
            render, KHÔNG publish — chọn sản phẩm rồi tiếp tục ở Hành động 2.
          </p>
        </div>
      ) : result.status === 'SUSPENDED' ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-accent-amber">
            ⚠️ SUSPENDED — cần Operator xử lý
          </p>
          <p className="text-[11px] leading-relaxed text-neutral-300">{result.message}</p>
          <p className="border-t border-hairline/40 pt-2 text-[11px] leading-relaxed text-neutral-400">
            Hệ thống đã dừng an toàn. Mở Cốc Cốc, xử lý <strong>login / CAPTCHA / OTP</strong> trên
            Shopee Affiliate cho tới khi vào được trang lấy link, rồi bấm{' '}
            <strong>“Xác nhận &amp; Chạy”</strong> lại. Không tạo job, không render, không publish.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-accent-rose">❌ FAIL</p>
          <p className="text-[11px] leading-relaxed text-neutral-300">{result.message}</p>
        </div>
      )}
    </div>
  );
}
