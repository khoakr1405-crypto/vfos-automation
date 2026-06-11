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
import { buildChineseSearchName } from '@/lib/cn-search-keywords';
import { ACCENT_BG_SOFT, ACCENT_TEXT, type AccentKey } from '@/lib/nav';
import type { GateState, OperatorJobDTO } from '@/lib/studio-data/types';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

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
  description?: string | null;
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
type ProductBinding = { shortLink: string | null; shopId: string | null; itemId: string | null };
type CardIdentity = Pick<CardSummary, 'shopId' | 'itemId' | 'shortLink'>;

// Quy tắc khớp sản phẩm DUY NHẤT cho toàn lane: ưu tiên (shopId,itemId), fallback
// shortLink. Dùng chung ở mọi nơi để tránh lệch định nghĩa giữa các gate.
function bindingMatchesCard(
  binding: ProductBinding | null | undefined,
  card: CardIdentity | null | undefined,
): boolean {
  if (!binding || !card) return false;
  if (
    card.shopId &&
    card.itemId &&
    binding.shopId === card.shopId &&
    binding.itemId === card.itemId
  ) {
    return true;
  }
  return !!card.shortLink && binding.shortLink === card.shortLink;
}

// Phát hiện ký tự CJK (Hán) — dùng để báo metadata nguồn tiếng Trung cần Việt hóa.
function hasCJK(s: string): boolean {
  return /[㐀-䶿一-鿿豈-﫿]/.test(s);
}

// Tìm job có productBinding khớp Product Card hiện tại (nguồn sự thật).
function findJobForCard(
  jobs: OperatorJobDTO[],
  card: CardIdentity | null | undefined,
): OperatorJobDTO | null {
  if (!card) return null;
  return jobs.find((j) => bindingMatchesCard(j.productBinding, card)) ?? null;
}

// Trich URL http/https DAU TIEN trong chuoi. Operator thuong paste nguyen doan
// share Douyin/Trung (hashtag + URL + text Trung). Dung o khoang trang / ky tu
// CJK / dau cau fullwidth, roi cat dau cau ASCII bam duoi. null neu khong co URL.
function extractFirstUrl(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/https?:\/\/[^\s　-〿㐀-䶿一-鿿豈-﫿＀-￯<>"'`]+/i);
  if (!m) return null;
  const url = m[0].replace(/[.,;:!?)\]}>'"]+$/u, '');
  return url.length > 0 ? url : null;
}

// Chống lặp hashtag: kiểm tra xem toàn bộ các hashtag trong chuỗi hashtags đã có trong caption chưa
function captionContainsHashtags(caption: string | null, hashtags: string | null): boolean {
  if (!caption || !hashtags) return false;
  const cleaned = hashtags.split(/\s+/).filter(Boolean);
  if (cleaned.length === 0) return false;
  return cleaned.every((h) => caption.includes(h));
}

// Auto-refresh production status: poll GET /api/studio/jobs trong lúc pipeline chạy
// nền. Interval 5s; dừng tại terminal; có max-duration để không poll vô hạn.
const PRODUCTION_POLL_INTERVAL_MS = 5_000;
const PRODUCTION_POLL_TIMEOUT_MS = 10 * 60_000; // 10 phút
const PRODUCTION_RUNNING_STATES = ['READY_TO_RENDER', 'RENDERING'];
const PRODUCTION_TERMINAL_STATES = [
  'READY_FOR_OPERATOR_REVIEW',
  'APPROVED',
  'PACKAGED',
  'FAILED',
  'REJECTED',
];

// Map mã lỗi kỹ thuật của route /package → thông điệp Operator dễ hiểu (KHÔNG raw log,
// KHÔNG exit code). Phân biệt rõ "thiếu dữ liệu nền từ Action 2" với lỗi đăng Facebook.
// Raw chi tiết để riêng trong "Chi tiết kỹ thuật".
type PrepareError = { title: string; hint: string; kind: 'missing_data' | 'needs_action' };

function friendlyPrepareError(code: string | undefined): PrepareError {
  switch (code) {
    case 'SCRIPT_ARTIFACT_MISSING':
    case 'VOICE_ARTIFACT_MISSING':
      return {
        title: 'Không thể chuẩn bị bài đăng vì thiếu dữ liệu script/voice từ Action 2.',
        hint: 'Vui lòng chạy lại sản xuất video ở Action 2 rồi phê duyệt lại.',
        kind: 'missing_data',
      };
    case 'CAPTIONED_PREVIEW_MISSING':
    case 'FINAL_VIDEO_AUDIO_MISSING':
      return {
        title: 'Không thể chuẩn bị bài đăng vì thiếu video bản cuối.',
        hint: 'Vui lòng chạy lại render/caption ở Action 2.',
        kind: 'missing_data',
      };
    case 'FINAL_QA_MISSING':
    case 'FINAL_QA_NOT_PASSING':
    case 'QA_NOT_PASS':
      return {
        title: 'Không thể chuẩn bị bài đăng vì video chưa đạt kiểm định chất lượng.',
        hint: 'Vui lòng kiểm tra lại QA ở Action 2.',
        kind: 'needs_action',
      };
    case 'PRODUCT_BINDING_MISMATCH':
      return {
        title: 'Sản phẩm đang chọn lệch với sản phẩm của video này.',
        hint: 'Chọn lại đúng sản phẩm ở Action 1 rồi thử lại.',
        kind: 'needs_action',
      };
    case 'FALLBACK_SOURCE_BLOCKED':
      return {
        title: 'Nguồn video hiện là bản mẫu, không dùng để đăng thật.',
        hint: 'Dùng nguồn video thật đã duyệt sạch ở Action 2.',
        kind: 'needs_action',
      };
    case 'NOT_APPROVED':
      return {
        title: 'Video chưa được duyệt nên chưa thể chuẩn bị bài đăng.',
        hint: 'Bấm "Duyệt preview video" ở Action 2 trước.',
        kind: 'needs_action',
      };
    case 'JOB_ALREADY_PUBLISHED':
      return {
        title: 'Bài đăng của video này đã được xử lý trước đó.',
        hint: '',
        kind: 'needs_action',
      };
    default:
      return {
        title: 'Chưa thể chuẩn bị bài đăng cho video này.',
        hint: 'Vui lòng kiểm tra lại Action 2, hoặc xem "Chi tiết kỹ thuật".',
        kind: 'needs_action',
      };
  }
}

// biome-ignore lint/style/noDefaultExport: Next.js page requires default export
export default function ProductReviewLanePage() {
  const [card, setCard] = useState<CardSummary | null>(null);
  const [draft, setDraft] = useState<SourceDraftResponse['draft']>(null);
  const [jobs, setJobs] = useState<OperatorJobDTO[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [jobCount, setJobCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);
  const [copiedCn, setCopiedCn] = useState(false);

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
  // Linear orchestrator (Tải & clean nguồn): prep an toàn nhiều bước trong 1 nút.
  const [preparingSource, setPreparingSource] = useState(false);
  const [prepStage, setPrepStage] = useState<string | null>(null);
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
  // Round D — Operator phê duyệt PREVIEW (Bước 3–7). Lỗi để cạnh nút cho rõ ràng.
  const [submittingApprovePreview, setSubmittingApprovePreview] = useState(false);
  const [approvePreviewError, setApprovePreviewError] = useState<string | null>(null);

  // Phase B — sau khi Operator DUYỆT preview, VFOS tự chuẩn bị bài đăng (package
  // ngầm + Facebook preflight READ-ONLY). KHÔNG publish, KHÔNG gọi Facebook live API.
  const [preparingPost, setPreparingPost] = useState(false);
  const [preparePostStage, setPreparePostStage] = useState<string | null>(null);
  const [preparePostError, setPreparePostError] = useState<PrepareError | null>(null);
  // Raw kỹ thuật (mã lỗi/log) — CHỈ hiển thị trong "Chi tiết kỹ thuật", không ở UI chính.
  const [preparePostDetails, setPreparePostDetails] = useState<string | null>(null);
  const [publishPreflight, setPublishPreflight] = useState<{
    facebookCredentialsConfigured: boolean;
    livePublishEnabled: boolean;
    canLivePublish: boolean;
    alreadyPublished: boolean;
    blockedReasons: string[];
    confirmPhrase?: string;
    targetChannel?: string | null;
    livePublishEnabledReason?: string;
    pageName?: string | null;
  } | null>(null);

  // Phase C — Live publish states (đăng trực tiếp, không modal confirm phrase)
  const [submittingPublish, setSubmittingPublish] = useState(false);
  const [publishResult, setPublishResult] = useState<any | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishStderr, setPublishStderr] = useState<string | null>(null);

  // Round C3 states (Action 2 — chạy sản xuất video)
  const [showRunConfirm, setShowRunConfirm] = useState(false);
  const [runConfirmInput, setRunConfirmInput] = useState('');
  const [submittingRun, setSubmittingRun] = useState(false);
  const [runNotice, setRunNotice] = useState<string | null>(null);
  const [runStage, setRunStage] = useState<string | null>(null);
  const [runReport, setRunReport] = useState<string | null>(null);
  const [productionLaunched, setProductionLaunched] = useState(false);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const pollStartRef = useRef<number | null>(null);
  // Phase B — nhớ jobId đã AUTO-RESUME preparePost trong PHIÊN hiện tại (chống loop).
  const autoResumedRef = useRef<Set<string>>(new Set());
  // Phase C — guard đồng bộ chống double-click publish: ref cập nhật tức thì (state
  // React async nên không đủ tin để chặn 2 POST khi Operator bấm nhanh 2 lần).
  const publishInFlightRef = useRef<boolean>(false);

  // Package preview states
  const [packagePreview, setPackagePreview] = useState<{
    caption: string | null;
    hashtags: string | null;
    affiliateLink: string | null;
    productName: string | null;
    pageName: string | null;
    packageManifest: Record<string, unknown> | null;
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);

  const latestJob = jobs.find((j) => j.id === selectedJobId) ?? null;

  const canPublish =
    latestJob?.state === 'PACKAGED' &&
    publishPreflight?.canLivePublish === true &&
    !publishPreflight?.alreadyPublished &&
    packagePreview !== null;

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
        const fetchedJobs = body.jobs ?? [];
        setJobs(fetchedJobs);
        setJobCount(body.count ?? 0);

        const foundJob = findJobForCard(fetchedJobs, currentCard);

        const urlParams = new URLSearchParams(window.location.search);
        const queryJobId = urlParams.get('jobId') || '';

        if (queryJobId && fetchedJobs.some((j) => j.id === queryJobId)) {
          setSelectedJobId(queryJobId);
        } else if (foundJob) {
          setSelectedJobId(foundJob.id);
        } else {
          setSelectedJobId('');
        }
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

  // Fetch package preview when state is PACKAGED
  useEffect(() => {
    if (selectedJobId && latestJob?.state === 'PACKAGED') {
      setLoadingPreview(true);
      fetch(`/api/studio/jobs/${selectedJobId}/package-preview`)
        .then((r) => r.json())
        .then((data) => {
          if (data.ok) {
            setPackagePreview({
              caption: data.caption,
              hashtags: data.hashtags,
              affiliateLink: data.affiliateLink,
              productName: data.productName,
              pageName: data.pageName,
              packageManifest: data.packageManifest,
            });
          } else {
            setPackagePreview(null);
          }
        })
        .catch(() => {
          setPackagePreview(null);
        })
        .finally(() => {
          setLoadingPreview(false);
        });
    } else {
      setPackagePreview(null);
    }
  }, [selectedJobId, latestJob?.state]);

  // Fetch publish preflight when state is PACKAGED
  useEffect(() => {
    if (selectedJobId && latestJob?.state === 'PACKAGED') {
      const params = new URLSearchParams();
      if (card?.shopId) params.append('shopId', card.shopId);
      if (card?.itemId) params.append('itemId', card.itemId);
      if (card?.shortLink) params.append('shortLink', card.shortLink);

      fetch(`/api/studio/jobs/${selectedJobId}/publish-facebook?${params.toString()}`)
        .then((r) => r.json())
        .then((pf) => {
          if (pf.ok) {
            setPublishPreflight({
              facebookCredentialsConfigured: !!pf.facebookCredentialsConfigured,
              livePublishEnabled: !!pf.livePublishEnabled,
              canLivePublish: !!pf.canLivePublish,
              alreadyPublished: !!pf.alreadyPublished,
              blockedReasons: Array.isArray(pf.blockedReasons) ? pf.blockedReasons : [],
              confirmPhrase: pf.confirmPhrase,
              targetChannel: pf.targetChannel,
              livePublishEnabledReason: pf.livePublishEnabledReason,
            });
          } else {
            setPublishPreflight(null);
          }
        })
        .catch(() => {
          setPublishPreflight(null);
        });
    } else {
      setPublishPreflight(null);
    }
  }, [selectedJobId, latestJob?.state, card?.shopId, card?.itemId, card?.shortLink]);

  // Chọn job + giữ URL ?jobId đồng bộ. URL rỗng khi clear để load() sau không tái
  // chọn job cũ đã lệch sản phẩm.
  const applySelectedJob = useCallback((jobId: string) => {
    setSelectedJobId(jobId);
    const url = new URL(window.location.href);
    if (jobId) {
      url.searchParams.set('jobId', jobId);
    } else {
      url.searchParams.delete('jobId');
    }
    window.history.pushState({}, '', url.toString());
  }, []);

  const handleCopyChineseName = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCn(true);
      setTimeout(() => setCopiedCn(false), 1500);
    } catch {
      // Clipboard bị chặn (không phải lỗi workflow) — không làm gì thêm.
    }
  };

  // ---- Action 2 handlers ---------------------------------------------------
  const handleSaveSource = async () => {
    if (!sourceUrlInput.trim()) {
      setSourceError('Vui lòng dán link video nguồn.');
      return;
    }
    // Trích URL từ chuỗi pasted (có thể kèm hashtag/text Trung). Chỉ báo lỗi khi
    // KHÔNG có URL http/https nào trong đoạn văn bản.
    const url = extractFirstUrl(sourceUrlInput);
    if (!url) {
      setSourceError('Không tìm thấy URL http/https trong đoạn văn bản đã dán.');
      return;
    }
    if (url.length > 3000) {
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
        body: JSON.stringify({ sourceKind: 'url', sourceUrl: url }),
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

  // Linear Workflow Continuity — 1 nút "Tải & clean nguồn" điều phối prep AN TOÀN:
  // lưu draft → tạo job đúng Product Card (nếu chưa có) → auto-select → source
  // intake/download/clean → trích frame. KHÔNG tự duyệt sạch, KHÔNG chạy production,
  // KHÔNG publish, KHÔNG gọi OpenAI/ElevenLabs. Confirm phrase prep do client cấp
  // tự động (đây là guard UX, không phải Production Gate); 2 gate thật vẫn human.
  const handlePrepareSource = async () => {
    if (!cardReady) {
      setSourceError('Cần Product Card hợp lệ (Hành động 1) trước khi tải nguồn.');
      return;
    }
    // Job vận hành luôn lấy theo Product Card (nguồn sự thật) → không bao giờ chạy
    // nhầm job lệch, kể cả khi dropdown đang chọn job khác.
    const existing = findJobForCard(jobs, card);
    if (!existing && !extractFirstUrl(sourceUrlInput)) {
      setSourceError('Không tìm thấy URL http/https trong đoạn văn bản đã dán.');
      return;
    }
    setPreparingSource(true);
    setSourceError(null);
    setSourceNotice(null);
    setActionError(null);
    try {
      let jobId = existing?.id ?? '';
      // (a) Chưa có job khớp → lưu nguồn + tạo job (prep an toàn, không cần gõ phrase).
      if (!jobId) {
        const url = extractFirstUrl(sourceUrlInput);
        if (!url) {
          setSourceError('Không tìm thấy URL http/https trong đoạn văn bản đã dán.');
          return;
        }
        setPrepStage('Đang lưu nguồn…');
        const draftRes = await fetch('/api/studio/create/source-draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceKind: 'url', sourceUrl: url }),
        });
        const draftBody = await draftRes.json();
        if (!draftRes.ok || !draftBody.ok) {
          setSourceError(draftBody.message || 'Lưu nguồn thất bại.');
          return;
        }
        setPrepStage('Đang tạo job cho Product Card…');
        const jobRes = await fetch('/api/studio/create/job-draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmPhrase: 'CREATE JOB' }),
        });
        const jobBody = await jobRes.json();
        if (!jobRes.ok || !jobBody.ok) {
          setSourceError(jobBody.message || 'Tạo job thất bại.');
          return;
        }
        jobId = jobBody.jobId;
      }
      // (b) Auto-select job đúng binding.
      applySelectedJob(jobId);
      // (c) Source intake (download + clean) nếu job chưa có nguồn/chưa duyệt. Đây là
      // prep local, KHÔNG phát sinh production/publish/live cost.
      const needsIntake = !existing || (!existing.cleanlinessStatus && !existing.sourceVideoPath);
      if (needsIntake) {
        setPrepStage('Đang tải & clean nguồn (có thể mất ~30s)…');
        const intakeRes = await fetch(`/api/studio/jobs/${jobId}/source-intake`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmPhrase: 'RUN SOURCE INTAKE' }),
        });
        const intakeBody = await intakeRes.json();
        if (!intakeRes.ok || !intakeBody.ok) {
          setSourceError(intakeBody.message || 'Tải / clean nguồn thất bại.');
          await load();
          return;
        }
      }
      // (d) DỪNG ở human gate: Operator xem frame + duyệt nguồn sạch (hệ thống KHÔNG tự duyệt).
      setSourceUrlInput('');
      setSourceNotice(
        'Đã chuẩn bị nguồn xong. Xem frame và bấm "Duyệt nguồn sạch" bên dưới để tiếp tục — hệ thống KHÔNG tự duyệt.',
      );
      await load();
    } catch {
      setSourceError('Lỗi kết nối đến API server.');
    } finally {
      setPreparingSource(false);
      setPrepStage(null);
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
        // Linear continuity: job mới là job vận hành → chọn tường minh + sync URL
        // trước load() (queryJobId precedence giữ đúng job mới) → bindingStatus PASS.
        if (body.jobId) applySelectedJob(body.jobId);
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

  // Phase B — VFOS tự chuẩn bị bài đăng SAU KHI Operator đã duyệt preview. Chuỗi:
  //   1) POST /package   → đóng gói ngầm (synchronous; KHÔNG Facebook/OpenAI/publish)
  //   2) GET  /publish-facebook → preflight READ-ONLY (đọc readiness/gate, KHÔNG publish)
  //   3) load() → refresh state thật (APPROVED → PACKAGED)
  // KHÔNG bao giờ POST /publish-facebook, KHÔNG gọi Facebook live API. Package gửi kèm
  // expectedProduct (Product Card đang chọn) để route đối chiếu Product Binding. Bất kỳ
  // bước nào fail → ghi đúng bước lỗi; checklist Action 3 derive từ STATE THẬT nên
  // KHÔNG hiện "Sẵn sàng đăng" giả khi package chưa thành công.
  const preparePost = async (jobId: string) => {
    setPreparingPost(true);
    setPreparePostError(null);
    setPreparePostDetails(null);
    setPublishPreflight(null);
    try {
      // Bước 1 — tạo gói bài đăng (ngầm).
      setPreparePostStage('Đang tạo gói bài đăng…');
      const expectedProduct = card
        ? { shortLink: card.shortLink, shopId: card.shopId, itemId: card.itemId }
        : undefined;
      const pkgRes = await fetch(`/api/studio/jobs/${jobId}/package`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expectedProduct ? { expectedProduct } : {}),
      });
      const pkg = await pkgRes.json();
      if (!pkgRes.ok || !pkg.ok) {
        // UI chính: thông điệp dễ hiểu. Raw (mã/log) → preparePostDetails cho "Chi tiết kỹ thuật".
        setPreparePostError(friendlyPrepareError(pkg.code));
        setPreparePostDetails(
          [
            pkg.code ? `Mã: ${pkg.code}` : null,
            typeof pkg.message === 'string' ? pkg.message : null,
            ...(Array.isArray(pkg.details) ? pkg.details.map(String) : []),
          ]
            .filter(Boolean)
            .join('\n') || null,
        );
        await load();
        return;
      }

      // Bước 2 — kiểm tra Facebook readiness (preflight, READ-ONLY, KHÔNG publish).
      setPreparePostStage('Đang kiểm tra Facebook readiness…');
      try {
        const pfRes = await fetch(`/api/studio/jobs/${jobId}/publish-facebook`);
        const pf = await pfRes.json();
        if (pfRes.ok && pf.ok) {
          setPublishPreflight({
            facebookCredentialsConfigured: !!pf.facebookCredentialsConfigured,
            livePublishEnabled: !!pf.livePublishEnabled,
            canLivePublish: !!pf.canLivePublish,
            alreadyPublished: !!pf.alreadyPublished,
            blockedReasons: Array.isArray(pf.blockedReasons) ? pf.blockedReasons : [],
          });
        }
        // Preflight fail KHÔNG chặn việc chuẩn bị bài đăng — chỉ là thiếu Facebook readiness.
      } catch {
        /* preflight là tuỳ chọn — không chặn flow chuẩn bị */
      }

      setPreparePostStage('Đã chuẩn bị xong bản nháp bài đăng.');
      await load();
    } catch {
      setPreparePostError({
        title: 'Lỗi kết nối khi chuẩn bị bài đăng.',
        hint: 'Kiểm tra kết nối tới máy chủ rồi thử lại.',
        kind: 'needs_action',
      });
    } finally {
      setPreparingPost(false);
    }
  };
  // Ref luôn trỏ preparePost mới nhất → auto-resume effect gọi qua ref, KHÔNG cần đưa
  // preparePost vào deps (tránh re-run mỗi render; vẫn dùng closure card/load mới nhất).
  const preparePostRef = useRef(preparePost);
  preparePostRef.current = preparePost;

  // Round D — Operator phê duyệt PREVIEW (Bước 3–7). Dùng lại route /approve sẵn có:
  // server tự enforce gate (not fallback + READY_FOR_OPERATOR_REVIEW + QA PASS +
  // hasPreview). KHÔNG publish, KHÔNG chạy production, KHÔNG auto — chỉ chạy khi
  // Operator bấm. Thành công → reload (state APPROVED) RỒI tự chuẩn bị bài đăng.
  const handleApprovePreview = async (jobId: string) => {
    setSubmittingApprovePreview(true);
    setApprovePreviewError(null);
    let approved = false;
    try {
      const res = await fetch(`/api/studio/jobs/${jobId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        approved = true;
        await load();
      } else {
        const detail = Array.isArray(data.details) ? ` (${data.details.join(' · ')})` : '';
        setApprovePreviewError((data.message || 'Phê duyệt preview thất bại.') + detail);
      }
    } catch {
      setApprovePreviewError('Lỗi kết nối đến API server.');
    } finally {
      setSubmittingApprovePreview(false);
    }
    // Sau khi "Đang duyệt" kết thúc, VFOS tự chuẩn bị bài đăng (Action 3). Tách khỏi
    // trạng thái approve để nút không kẹt "Đang duyệt…" trong lúc đóng gói/preflight.
    if (approved) {
      await preparePost(jobId);
    }
  };

  const getPublishDisabledReason = () => {
    if (latestJob?.state !== 'PACKAGED') {
      return 'Chờ job hoàn thành đóng gói bài đăng (PACKAGED).';
    }
    if (publishPreflight?.alreadyPublished) {
      return 'Bài đăng đã được xuất bản trước đó.';
    }
    if (publishPreflight && !publishPreflight.livePublishEnabled) {
      return (
        publishPreflight.livePublishEnabledReason ||
        'Bị khóa: Chưa bật VFOS_STUDIO_ALLOW_LIVE_PUBLISH trong môi trường.'
      );
    }
    if (publishPreflight && !publishPreflight.facebookCredentialsConfigured) {
      return 'Bị khóa: Chưa cấu hình Page ID hoặc Access Token trên máy chủ.';
    }
    if (publishPreflight && publishPreflight.blockedReasons.length > 0) {
      return `Bị khóa: ${publishPreflight.blockedReasons[0]}`;
    }
    if (!packagePreview) {
      return 'Đang tải bản xem trước bài viết...';
    }
    return 'Chờ sẵn sàng đăng.';
  };

  // Phase C — Đăng bài Facebook TRỰC TIẾP khi Operator bấm nút (đã bỏ modal confirm
  // phrase). Không auto: chỉ chạy khi đến từ onClick. Server (POST publish-facebook)
  // vẫn evaluateLivePublishGates(jobId, expectedProduct) trước khi đăng — UI chỉ là
  // lớp tiện lợi, không phải nguồn quyết định. Chống double-click bằng ref đồng bộ.
  const handleLivePublish = async (jobId: string) => {
    // Guard: đang đăng (ref đồng bộ), gate chưa mở, hoặc đã đăng → không POST.
    if (
      publishInFlightRef.current ||
      submittingPublish ||
      !canPublish ||
      publishPreflight?.alreadyPublished
    ) {
      return;
    }
    publishInFlightRef.current = true;
    setSubmittingPublish(true);
    setPublishError(null);
    setPublishStderr(null);
    try {
      const expectedProduct = card
        ? { shortLink: card.shortLink, shopId: card.shopId, itemId: card.itemId }
        : undefined;
      const res = await fetch(`/api/studio/jobs/${jobId}/publish-facebook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedProduct }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setPublishResult(data);
        await load();
        // Fetch new preflight to sync alreadyPublished status
        const params = new URLSearchParams();
        if (card?.shopId) params.append('shopId', card.shopId);
        if (card?.itemId) params.append('itemId', card.itemId);
        if (card?.shortLink) params.append('shortLink', card.shortLink);

        const pfRes = await fetch(`/api/studio/jobs/${jobId}/publish-facebook?${params.toString()}`);
        const pf = await pfRes.json();
        if (pfRes.ok && pf.ok) {
          setPublishPreflight({
            facebookCredentialsConfigured: !!pf.facebookCredentialsConfigured,
            livePublishEnabled: !!pf.livePublishEnabled,
            canLivePublish: !!pf.canLivePublish,
            alreadyPublished: !!pf.alreadyPublished,
            blockedReasons: Array.isArray(pf.blockedReasons) ? pf.blockedReasons : [],
            confirmPhrase: pf.confirmPhrase,
            targetChannel: pf.targetChannel,
            livePublishEnabledReason: pf.livePublishEnabledReason,
          });
        }
      } else {
        setPublishError(data.message || 'Yêu cầu đăng bài thất bại.');
        if (data.details && data.details.length > 0) {
          setPublishError(
            (data.message || 'Yêu cầu đăng bài thất bại.') + ` (${data.details.join(' · ')})`,
          );
        }
        if (data.stderr) {
          setPublishStderr(data.stderr);
        }
      }
    } catch {
      setPublishError('Lỗi kết nối đến API server.');
    } finally {
      setSubmittingPublish(false);
      publishInFlightRef.current = false;
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
      // Gửi product đang chọn ở Action 1 để server đối chiếu với binding của job
      // (chống "chọn sản phẩm A nhưng job đang là B"). Server tự load card thật.
      const expectedProduct = card
        ? { shortLink: card.shortLink, shopId: card.shopId, itemId: card.itemId }
        : undefined;
      const res = await fetch(`/api/studio/jobs/${jobId}/run-production`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          dryRun
            ? { dryRun: true, expectedProduct }
            : { confirmPhrase: runConfirmInput, expectedProduct },
        ),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setRunConfirmInput('');
        setShowRunConfirm(false);
        setRunStage(data.status ?? null);
        setRunReport(data.reportSummary ?? null);
        setRunNotice(data.message ?? (dryRun ? 'Dry-run thành công.' : 'Đã khởi chạy sản xuất.'));
        if (!dryRun) {
          // Fresh poll window cho lần chạy mới.
          pollStartRef.current = null;
          setPollTimedOut(false);
          setProductionLaunched(true);
        }
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

  // Auto-refresh: poll job state trong lúc pipeline chạy nền. Gate theo STATE THẬT
  // (không chỉ cờ in-memory) → tự resume sau khi reload trang nếu job còn chạy nền.
  // Chỉ gọi load() (GET) — KHÔNG run-production/approve/publish. Dừng tại terminal
  // hoặc khi quá max-duration.
  useEffect(() => {
    const state = latestJob?.state;
    const isRunning = productionLaunched || (!!state && PRODUCTION_RUNNING_STATES.includes(state));
    if (!isRunning) {
      pollStartRef.current = null;
      if (pollTimedOut) setPollTimedOut(false);
      return;
    }
    if (state && PRODUCTION_TERMINAL_STATES.includes(state)) {
      setProductionLaunched(false);
      pollStartRef.current = null;
      if (pollTimedOut) setPollTimedOut(false);
      return;
    }
    if (pollStartRef.current === null) pollStartRef.current = Date.now();
    if (Date.now() - pollStartRef.current > PRODUCTION_POLL_TIMEOUT_MS) {
      if (!pollTimedOut) setPollTimedOut(true);
      return; // quá hạn → ngừng auto poll, để Operator bấm "Làm mới trạng thái".
    }
    const timer = setInterval(() => {
      load();
    }, PRODUCTION_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [productionLaunched, latestJob, load, pollTimedOut]);

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
        setImgError(false); // Reset image error for new image
        // Product Card mới là nguồn sự thật — refresh card thật từ API.
        const cardRes = await fetch('/api/studio/commerce/current-product-card').then((r) =>
          r.json(),
        );
        const newCard: CardSummary | null = cardRes.ok ? cardRes.card : (data.card ?? null);
        if (newCard) setCard(newCard);
        // Re-bind job theo sản phẩm MỚI: có job khớp → chọn job đó (PASS); không có
        // → clear về rỗng (MISSING). KHÔNG giữ job cũ lệch sản phẩm — đổi Product Card
        // KHÔNG được để lại MISMATCH mặc định.
        const matched = findJobForCard(jobs, newCard);
        applySelectedJob(matched?.id ?? '');
        const name = newCard?.name ?? data.card?.name ?? 'sản phẩm';
        setSuccessMessage(
          matched
            ? `Đã chọn sản phẩm: ${name} — tự khớp job [${matched.id}].`
            : `Đã chọn sản phẩm: ${name} — chưa có job khớp, hãy chuẩn bị job mới ở Hành động 2.`,
        );
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
  // Metadata nguồn tiếng Trung → cần bản dịch tiếng Việt trước khi tạo job.
  const cardNeedsTranslation = !!card && (hasCJK(card.name) || hasCJK(card.description ?? ''));
  // Từ khóa tiếng Trung (local, không API) để Operator copy đi tìm source video.
  const chineseSearchName = card ? buildChineseSearchName(card.name) : null;

  // Source intake: URL trích từ chuỗi pasted (Douyin/Trung). Preview cho Operator
  // trước khi lưu; chỉ chặn lưu khi không có URL nào.
  const extractedSourceUrl = extractFirstUrl(sourceUrlInput);
  const sourceInputHasText = sourceUrlInput.trim().length > 0;
  const sourceUrlWasExtracted =
    !!extractedSourceUrl && extractedSourceUrl !== sourceUrlInput.trim();
  // Đã có job khớp Product Card chưa (không phụ thuộc job đang chọn ở dropdown).
  const cardHasMatchingJob = !!card && findJobForCard(jobs, card) !== null;

  // Draft only counts if it belongs to the CURRENT Product Card.
  const draftMatchesCard =
    !!draft?.source?.url &&
    !!card &&
    !!draft.product &&
    (draft.product.shortLink === card.shortLink ||
      (draft.product.shopid === card.shopId && draft.product.itemid === card.itemId));
  const sourceUrl = draftMatchesCard ? (draft?.source?.url ?? null) : null;

  const isFallbackSource = latestJob?.source?.sourceMode === 'fallback';

  // Product binding coherence: Product Card đang chọn ở Action 1 có khớp sản phẩm
  // ĐÃ BIND vào job hiện tại (Action 2) không. Job mang binding riêng (snapshot lúc
  // tạo), nên global card có thể lệch nếu Operator chọn sản phẩm khác mà chưa tạo job.
  const jobBinding = latestJob?.productBinding ?? null;
  const cardMatchesJob = bindingMatchesCard(jobBinding, card);
  // Mismatch chỉ "thật" khi có cả card lẫn job nhưng identity khác nhau.
  const cardJobMismatch = !!card && !!latestJob && !cardMatchesJob;

  const bindingStatus: 'PASS' | 'MISMATCH' | 'MISSING' = (() => {
    if (!card || !jobBinding) return 'MISSING';
    return cardMatchesJob ? 'PASS' : 'MISMATCH';
  })();

  const getAction2LockReason = () => {
    if (!cardReady) return 'Hoàn tất Hành động 1 (Product Card hợp lệ) để mở bước sản xuất.';
    if (bindingStatus === 'MISSING')
      return 'Thiếu thông tin liên kết sản phẩm (productBinding) hoặc chưa chọn Job.';
    if (bindingStatus === 'MISMATCH')
      return 'Product Card đang chọn lệch với sản phẩm được bind trong Job hiện tại.';
    return undefined;
  };

  const jobApproved =
    (latestJob?.operatorDecision === 'APPROVED' ||
      latestJob?.state === 'APPROVED' ||
      latestJob?.state === 'PACKAGED') &&
    !isFallbackSource &&
    cardMatchesJob;

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
  // Badge header Bước 3–7 derive từ STATE THẬT (không kẹt runStage tĩnh). runStage
  // chỉ là fallback cho khoảnh khắc vừa launch trước lần poll đầu.
  const productionHeaderStatus: string | null = productionDone
    ? 'CHỜ OPERATOR DUYỆT'
    : latestJob?.state === 'FAILED'
      ? 'FAILED'
      : latestJob?.state === 'REJECTED'
        ? 'REJECTED'
        : productionRunning
          ? 'RUNNING'
          : runStage;

  // Gate nút "Duyệt preview video" (Bước 3–7). Mọi điều kiện này CŨNG được route
  // /approve enforce lại server-side; UI chỉ để không hiện nút khi chưa đủ điều kiện.
  // Thiếu bất kỳ điều kiện nào → ẩn nút (lý do hiển thị ở GateHint cuối panel).
  const canApprovePreview =
    latestJob?.state === 'READY_FOR_OPERATOR_REVIEW' &&
    latestJob?.qaStatus === 'PASS' &&
    !!latestJob?.hasPreview &&
    bindingStatus === 'PASS' &&
    sourceApproved &&
    !isFallbackSource;

  // Phase B — AUTO-RESUME: job đã APPROVED nhưng CHƯA PACKAGED + đủ guard → tự chạy
  // preparePost MỘT LẦN/phiên khi Operator mở/F5 trang (không kẹt "Chờ đóng gói" mà
  // không có hành động). Chống loop: ref Set nhớ jobId đã auto-resume; nếu có lỗi thì
  // KHÔNG tự gọi lại (retry tay nằm trong "Chi tiết kỹ thuật"). KHÔNG auto khi
  // fallback/demo, binding lệch, source chưa sạch, đang chạy, đã đóng gói, đã đăng.
  // KHÔNG gọi /approve, KHÔNG POST publish-facebook, KHÔNG publish/production.
  useEffect(() => {
    const jobId = latestJob?.id;
    if (!jobId) return;
    const eligible =
      jobApproved &&
      latestJob?.state !== 'PACKAGED' &&
      !isFallbackSource &&
      bindingStatus === 'PASS' &&
      sourceApproved &&
      !publishPreflight?.alreadyPublished &&
      !preparingPost &&
      !preparePostError &&
      !autoResumedRef.current.has(jobId);
    if (!eligible) return;
    autoResumedRef.current.add(jobId); // đánh dấu TRƯỚC khi gọi → chống loop/StrictMode
    void preparePostRef.current(jobId);
  }, [
    latestJob,
    jobApproved,
    isFallbackSource,
    bindingStatus,
    sourceApproved,
    publishPreflight,
    preparingPost,
    preparePostError,
  ]);

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
          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
              <div className="flex shrink-0 flex-col items-center gap-1">
                <div className="flex aspect-square w-24 items-center justify-center overflow-hidden rounded-lg border border-hairline bg-gradient-to-br from-raised to-panel">
                  {card.productImageUrl && !imgError ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={card.productImageUrl}
                      alt={card.name}
                      className="h-full w-full object-contain"
                      onError={() => setImgError(true)}
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-neutral-500">
                      <Icon name="rawvisual" width={24} height={24} />
                      <span className="text-[9px] font-semibold text-accent-amber">
                        ảnh chưa có
                      </span>
                    </div>
                  )}
                </div>
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

            {/* Product Card Enrichment — Operator hiểu sản phẩm trước khi tạo job.
                Display-only: KHÔNG đổi nguồn sự thật cho binding (vẫn shopId/itemId/shortLink). */}
            <div className="space-y-2 rounded-lg border border-hairline/70 bg-panel/30 p-3 text-[11px] leading-relaxed">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                Thông tin sản phẩm (Việt hóa)
              </p>
              <div className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1.5">
                <span className="text-neutral-500">Tên (VI):</span>
                <span className="text-neutral-200">{card.name}</span>

                <span className="text-neutral-500">Mô tả:</span>
                <span className={card.description ? 'text-neutral-300' : 'italic text-neutral-600'}>
                  {card.description ?? 'Chưa có mô tả — sẽ bổ sung khi trích xuất chi tiết.'}
                </span>

                {cardNeedsTranslation && (
                  <>
                    <span className="text-neutral-500">Bản dịch VI:</span>
                    <span className="italic text-accent-amber">
                      Chưa có bản dịch — metadata nguồn tiếng Trung, cần Việt hóa trước khi tạo job.
                    </span>
                  </>
                )}
              </div>

              {/* Tên tìm kiếm tiếng Trung — copy đi tìm source video/sản phẩm trên
                  Douyin/Taobao/1688. Suy ra cục bộ từ tên VI (không gọi translate API).
                  Display-only: KHÔNG ảnh hưởng job binding. */}
              <div className="flex flex-wrap items-center gap-2 border-t border-hairline/50 pt-2">
                <span className="text-[10px] font-medium text-neutral-500">
                  Tên tìm kiếm tiếng Trung:
                </span>
                {chineseSearchName ? (
                  <>
                    <span lang="zh" className="font-medium text-neutral-100">
                      {chineseSearchName}
                    </span>
                    <Button
                      variant="outline"
                      className="!py-0.5 !px-1.5 text-[9px]"
                      onClick={() => handleCopyChineseName(chineseSearchName)}
                    >
                      {copiedCn ? '✓ Đã copy' : 'Copy từ khóa Trung'}
                    </Button>
                  </>
                ) : (
                  <span className="text-[10px] italic text-neutral-600">
                    Chưa có tên Trung sát nghĩa
                  </span>
                )}
              </div>

              {!card.productImageUrl && (
                <p className="text-[10px] text-accent-amber">
                  ⚠ Ảnh minh họa chưa có. Bấm “Lấy link Shopee mới” để trích xuất lại kèm ảnh — hoặc
                  vẫn tạo job được (ảnh không bắt buộc cho binding).
                </p>
              )}
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

        {cardReady && cardJobMismatch ? (
          <NoticeBox accent="rose">
            Product Card hợp lệ nhưng KHÁC sản phẩm của job hiện tại ở Hành động 2 (
            <strong>{latestJob?.product}</strong>). Tạo job mới cho sản phẩm này, hoặc chọn lại sản
            phẩm khớp job — sản xuất đang khoá để tránh chạy nhầm.
          </NoticeBox>
        ) : (
          <GateHint
            ok={cardReady}
            okText={
              latestJob && cardMatchesJob
                ? 'Product Card khớp job hiện tại → Hành động 2 sẵn sàng'
                : 'Product Card hợp lệ → tạo job ở Hành động 2'
            }
            waitText="Cần Product Card đúng owner để mở Hành động 2"
          />
        )}
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
              : bindingStatus === 'MISMATCH'
                ? { label: 'Lệch job — khoá render', accent: 'rose' }
                : bindingStatus === 'MISSING'
                  ? { label: 'Cần tạo job mới', accent: 'amber' }
                  : latestJob
                    ? { label: latestJob.statusLabel, accent: latestJob.statusAccent }
                    : { label: 'Chưa có job', accent: 'blue' }
        }
        locked={!cardReady}
        lockReason="Hoàn tất Hành động 1 (Product Card hợp lệ) để mở bước sản xuất."
      >
        {/* Linear Workflow Continuity — Product Card hợp lệ nhưng chưa có job khớp:
            KHÔNG khóa chết panel. Dẫn Operator dán nguồn + tạo job mới cho sản phẩm
            hiện tại → job mới tự khớp binding (PASS) → mở bước sản xuất. */}
        {cardReady && !latestJob && (
          <NoticeBox accent="amber">
            Product Card <strong>{card?.name}</strong> đã hợp lệ nhưng chưa có job sản xuất khớp.
            Dán URL video nguồn bên dưới rồi bấm <strong>"Tải & clean nguồn"</strong> — hệ thống tự
            tạo job đúng sản phẩm, tải & clean nguồn, rồi dừng ở cổng{' '}
            <strong>Duyệt nguồn sạch</strong>.
          </NoticeBox>
        )}

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
              type="text"
              disabled={savingSource || creatingJob || preparingSource}
              value={sourceUrlInput}
              onChange={(e) => setSourceUrlInput(e.target.value)}
              placeholder="Dán link hoặc nguyên đoạn share (TikTok, Douyin, ...) — tự trích URL"
              className="w-full rounded-lg border border-hairline bg-panel/80 px-3 py-2 text-xs text-neutral-100 outline-none focus:border-accent-violet disabled:opacity-50"
            />
            {sourceInputHasText && !extractedSourceUrl && (
              <p className="text-[10px] text-accent-rose">
                Không tìm thấy URL trong đoạn văn bản — cần một link bắt đầu bằng http:// hoặc
                https:// (có thể nằm giữa text).
              </p>
            )}
            {extractedSourceUrl && (
              <div className="space-y-0.5 rounded-md border border-hairline/60 bg-panel/40 px-2.5 py-1.5">
                <span className="text-[9px] font-medium uppercase tracking-wider text-neutral-500">
                  {sourceUrlWasExtracted ? 'URL trích xuất từ text đã dán' : 'URL nguồn sẽ lưu'}
                </span>
                <p className="break-all font-mono text-[10px] text-accent-blue">
                  {extractedSourceUrl}
                </p>
              </div>
            )}

            {/* Nút CHÍNH của Operator — 1 click điều phối prep an toàn tới cổng duyệt sạch.
                "Lưu nháp" chỉ là phụ (auto-save thủ công), không còn là CTA chính. */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                className="!py-1.5 !px-3 text-[11px] font-semibold bg-accent-violet hover:bg-accent-violet text-white border-none disabled:opacity-30"
                onClick={handlePrepareSource}
                disabled={
                  preparingSource ||
                  savingSource ||
                  creatingJob ||
                  !cardReady ||
                  (!extractedSourceUrl && !cardHasMatchingJob)
                }
              >
                {preparingSource ? 'Đang chuẩn bị nguồn…' : 'Tải & clean nguồn'}
              </Button>
              <Button
                variant="ghost"
                className="!py-1 !px-2 text-[10px]"
                onClick={handleSaveSource}
                disabled={savingSource || creatingJob || preparingSource || !extractedSourceUrl}
                title="Chỉ lưu URL nháp (phụ/debug) — không tải/clean."
              >
                {savingSource ? 'Đang lưu…' : 'Lưu nháp'}
              </Button>
              {draftMatchesCard && (
                <Button
                  variant="outline"
                  className="!py-1 !px-2.5 text-[10px] font-semibold"
                  onClick={handleDeleteSource}
                  disabled={savingSource || creatingJob || preparingSource}
                >
                  Xóa nháp
                </Button>
              )}
            </div>

            {/* Trạng thái prep tuyến tính: chưa job → tạo job → tải/clean → chờ duyệt. */}
            {preparingSource && prepStage && (
              <p className="flex items-center gap-1.5 text-[10px] text-accent-cyan">
                <span className="h-2.5 w-2.5 animate-spin rounded-full border border-accent-cyan border-t-transparent" />
                {prepStage}
              </p>
            )}
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

        {/* Chọn Job vận hành */}
        <div className="rounded-lg border border-hairline bg-raised/30 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="jobSelect"
              className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500"
            >
              Chọn Job vận hành
            </label>
            {latestJob && (
              <span className="font-mono text-[10px] text-neutral-500">{latestJob.id}</span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <select
              id="jobSelect"
              value={selectedJobId}
              onChange={(e) => applySelectedJob(e.target.value)}
              className="w-full rounded-lg border border-hairline bg-panel/85 px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-accent-violet"
            >
              <option value="">-- Chưa chọn Job --</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  [{j.id}] {j.product} ({j.statusLabel})
                </option>
              ))}
            </select>

            {latestJob ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusChip accent={latestJob.statusAccent}>{latestJob.statusLabel}</StatusChip>
                  {isFallbackSource && (
                    <StatusChip accent="rose">Demo / Fallback Source</StatusChip>
                  )}
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
                Chưa chọn job. Hãy chọn một job từ danh sách trên hoặc tiến hành dán nguồn và tạo
                job mới.
              </p>
            )}
          </div>
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
                {isFallbackSource && (
                  <NoticeBox accent="rose">
                    Nguồn hiện tại là fallback mẫu, không được dùng để sản xuất video thật cho sản
                    phẩm này.
                  </NoticeBox>
                )}
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
            {productionHeaderStatus && (
              <span
                className={`font-mono text-[10px] ${
                  productionDone
                    ? 'text-accent-green'
                    : latestJob?.state === 'FAILED' || latestJob?.state === 'REJECTED'
                      ? 'text-accent-rose'
                      : 'text-neutral-400'
                }`}
              >
                {productionHeaderStatus}
              </span>
            )}
          </div>
          {pollTimedOut && (
            <NoticeBox accent="amber">
              Quá thời gian cập nhật tự động. Bấm "Làm mới trạng thái" để kiểm tra tiến trình.
            </NoticeBox>
          )}

          {/* Binding hiện tại — Operator thấy rõ job nào + sản phẩm nào sẽ được sản xuất */}
          <div className="rounded-lg border border-hairline/60 bg-panel/30 p-3 space-y-2 text-[11px] leading-relaxed">
            <div className="flex justify-between items-center border-b border-hairline pb-1.5 mb-1.5">
              <span className="font-medium text-neutral-400">CHI TIẾT WORKFLOW INTEGRITY</span>
              {(() => {
                if (bindingStatus === 'PASS') {
                  return (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-950/40 text-accent-green border border-accent-green/30">
                      PASS
                    </span>
                  );
                } else if (bindingStatus === 'MISMATCH') {
                  return (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-950/40 text-accent-rose border border-accent-rose/30">
                      MISMATCH
                    </span>
                  );
                } else {
                  return (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950/40 text-accent-amber border border-accent-amber/30">
                      MISSING
                    </span>
                  );
                }
              })()}
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1">
              <span className="text-neutral-500">Mã Job hiện tại:</span>
              <span className="font-mono text-neutral-300 font-semibold">
                {latestJob ? latestJob.id : <em className="text-neutral-600">Chưa chọn</em>}
              </span>

              <span className="text-neutral-500">Sản phẩm của Job:</span>
              <span className="text-neutral-200 font-medium">
                {latestJob ? latestJob.product : <em className="text-neutral-600">Chưa chọn</em>}
              </span>

              <span className="text-neutral-500 font-medium">Sản phẩm đang chọn:</span>
              <span className="text-neutral-300">
                {card ? card.name : <em className="text-neutral-600">Chưa chọn</em>}
              </span>

              <span className="text-neutral-500">Video nguồn của Job:</span>
              <span className="text-neutral-300 font-mono break-all leading-normal">
                {latestJob?.sourceVideoPath ? (
                  <span className="text-accent-cyan">📁 {latestJob.sourceVideoPath}</span>
                ) : latestJob?.sourceVideoUrl ? (
                  <span className="text-accent-blue">🔗 {latestJob.sourceVideoUrl}</span>
                ) : (
                  <span className="text-neutral-500">Chưa cấu hình</span>
                )}
              </span>

              <span className="text-neutral-500">Trạng thái Action 2:</span>
              <span
                className={
                  bindingStatus === 'PASS'
                    ? 'text-accent-green font-medium'
                    : 'text-accent-rose font-medium'
                }
              >
                {bindingStatus === 'PASS'
                  ? 'Mở khóa (Sẵn sàng chạy sản xuất)'
                  : `Khóa (${getAction2LockReason()})`}
              </span>
            </div>
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
          ) : cardJobMismatch ? (
            <div className="space-y-2">
              <NoticeBox accent="rose">
                Product Card đang chọn ở Action 1 (<strong>{card?.name}</strong>) KHÔNG khớp sản
                phẩm đã bind vào job hiện tại (<strong>{latestJob.product}</strong>). Vui lòng chọn
                lại sản phẩm khớp với job, hoặc tạo job mới cho sản phẩm đang chọn. (Sản xuất bị
                khoá để tránh chạy nhầm sản phẩm.)
              </NoticeBox>
              <Button
                variant="outline"
                className="!py-1 !px-2.5 text-[10px]"
                onClick={() => load()}
                disabled={loading}
              >
                Làm mới trạng thái
              </Button>
            </div>
          ) : !card ? (
            <NoticeBox accent="amber">
              Chưa chọn Product Card ở Action 1. Chọn sản phẩm để xác nhận đúng sản phẩm trước khi
              chạy sản xuất.
            </NoticeBox>
          ) : (
            <div className="space-y-2.5">
              <p className="text-xs text-neutral-400">
                Nguồn đã duyệt sạch & Product Card khớp job. Chạy pipeline sản xuất từ clean source
                đã duyệt (không nhảy route kỹ thuật).
              </p>
              {isFallbackSource ? (
                <NoticeBox accent="rose">
                  Nguồn hiện tại là fallback mẫu, không được dùng để sản xuất video thật cho sản
                  phẩm này.
                </NoticeBox>
              ) : !showRunConfirm ? (
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
            {canApprovePreview && (
              <Button
                variant="success"
                onClick={() => handleApprovePreview(latestJob.id)}
                disabled={submittingApprovePreview}
                className="!py-1.5 !px-3 text-[11px] bg-accent-green hover:bg-accent-green/90 text-neutral-900 border-none font-semibold disabled:opacity-50"
              >
                {submittingApprovePreview ? 'Đang duyệt…' : '✓ Duyệt preview video'}
              </Button>
            )}
            <DebugLink href="/render?lane=product-review">Xem tiến độ render (debug)</DebugLink>
            <DebugLink href="/qa?lane=product-review">Xem QA (debug)</DebugLink>
          </PanelActions>
          {canApprovePreview && (
            <p className="text-[10px] text-neutral-400">
              Sau khi duyệt, VFOS tự chuẩn bị bài đăng ở Hành động 3 (đóng gói + kiểm tra
              readiness). KHÔNG tự đăng gì lên Facebook.
            </p>
          )}
          {approvePreviewError && (
            <p className="text-[10px] text-accent-rose">Lỗi duyệt preview: {approvePreviewError}</p>
          )}
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
        desc="Sau khi Operator duyệt video, VFOS tự đóng gói bài đăng + kiểm tra readiness. Đăng thật lên Facebook có gate cứng (làm ở Phase C)."
        status={((): { label: string; accent: AccentKey } => {
          // Header derive từ trạng thái THẬT của việc chuẩn bị bài đăng (không kẹt ở
          // "Sẵn sàng đóng gói" khi checklist còn dở) → tránh mâu thuẫn header vs nội dung.
          if (loading) return { label: 'Đang tải…', accent: 'blue' };
          if (!jobApproved) {
            if (bindingStatus === 'MISMATCH')
              return { label: 'Khoá — lệch sản phẩm', accent: 'rose' };
            if (bindingStatus === 'MISSING')
              return { label: 'Khoá — thiếu binding', accent: 'amber' };
            return { label: 'Khoá — chờ duyệt', accent: 'amber' };
          }
          if (latestJob?.state === 'PUBLISHED' || publishPreflight?.alreadyPublished)
            return { label: 'Đã đăng', accent: 'green' };
          if (latestJob?.state === 'PACKAGED') return { label: 'Sẵn sàng đăng', accent: 'green' };
          if (preparingPost) return { label: 'Đang chuẩn bị bài đăng', accent: 'blue' };
          if (preparePostError) {
            return preparePostError.kind === 'missing_data'
              ? { label: 'Thiếu dữ liệu', accent: 'amber' }
              : { label: 'Cần xử lý', accent: 'rose' };
          }
          return { label: 'Chờ đóng gói', accent: 'amber' };
        })()}
        locked={!jobApproved}
        lockReason={
          isFallbackSource
            ? 'Nguồn hiện tại là fallback mẫu, không được dùng để sản xuất video thật cho sản phẩm này.'
            : bindingStatus === 'MISSING'
              ? 'Thiếu thông tin liên kết sản phẩm (productBinding) hoặc chưa chọn Job.'
              : bindingStatus === 'MISMATCH'
                ? 'Product Card đang chọn ở Hành động 1 không khớp với sản phẩm đã bind vào job hiện tại.'
                : 'Cần job đã APPROVED (QA PASS + Operator duyệt preview) để mở bước đóng gói.'
        }
      >
        {/* Tiến trình VFOS tự chuẩn bị bài đăng (sau khi Operator duyệt video). */}
        {preparingPost && (
          <div className="flex items-center gap-2 rounded-lg border border-accent-blue/30 bg-accent-blue/10 px-3 py-2 text-[11px] text-accent-blue">
            <UtilIcon name="clock" width={13} height={13} />
            <span>
              VFOS đang chuẩn bị bài đăng…{preparePostStage ? ` ${preparePostStage}` : ''}
            </span>
          </div>
        )}
        {!preparingPost && preparePostStage && !preparePostError && (
          <div className="flex items-center gap-2 rounded-lg border border-accent-green/30 bg-accent-green/10 px-3 py-2 text-[11px] text-accent-green">
            <UtilIcon name="check" width={13} height={13} />
            <span>{preparePostStage}</span>
          </div>
        )}
        {preparePostError && (
          <NoticeBox accent="amber">
            <strong>{preparePostError.title}</strong>
            {preparePostError.hint && (
              <span className="mt-0.5 block text-[10px] opacity-90">{preparePostError.hint}</span>
            )}
          </NoticeBox>
        )}

        {/* Checklist chuẩn bị bài đăng — derive từ STATE THẬT + Facebook preflight.
            KHÔNG hiện "Sẵn sàng đăng" giả: chỉ ok khi job thật đã PACKAGED. */}
        {(() => {
          const st = latestJob?.state;
          // DTO state đỉnh là PACKAGED; "đã đăng" lấy từ preflight (đọc facebook_publish_status).
          const packaged = st === 'PACKAGED';
          const published = !!publishPreflight?.alreadyPublished;
          const videoApproved = !!jobApproved && !!latestJob?.hasPreview;
          const productOk = bindingStatus === 'PASS';
          const affiliateOk = latestJob?.pipeline.affiliateLink === 'pass';
          const preparing = preparingPost;
          const errored = !!preparePostError;
          // Trạng thái chung cho các bước phụ thuộc đóng gói: idle → "chưa sẵn sàng",
          // lỗi → "lỗi", đang chạy → "đang làm" (KHÔNG treo "đang chuẩn bị" vô nghĩa).
          const pkgState: PrepState = packaged
            ? 'ok'
            : errored
              ? 'fail'
              : preparing
                ? 'doing'
                : 'wait';
          const pkgNote = packaged
            ? undefined
            : errored
              ? 'lỗi'
              : preparing
                ? 'đang làm'
                : 'chưa sẵn sàng';
          const pf = publishPreflight;
          let fbState: PrepState = preparing ? 'doing' : 'wait';
          let fbNote = preparing ? 'đang kiểm tra' : 'chưa kiểm tra';
          if (pf) {
            if (!pf.facebookCredentialsConfigured) {
              fbState = 'fail';
              fbNote = 'chưa cấu hình';
            } else if (!pf.livePublishEnabled) {
              fbState = 'warn';
              fbNote = 'chế độ nháp / chưa bật đăng thật';
            } else if (pf.canLivePublish) {
              fbState = 'ok';
              fbNote = 'sẵn sàng';
            } else {
              fbState = 'warn';
              fbNote = 'cần kiểm tra gate';
            }
          }
          return (
            <div className="grid gap-2 sm:grid-cols-2">
              <PrepRow
                label="Video đã duyệt"
                state={videoApproved ? 'ok' : 'wait'}
                note={videoApproved ? undefined : 'chờ duyệt'}
              />
              <PrepRow
                label="Đúng sản phẩm"
                state={productOk ? 'ok' : 'fail'}
                note={productOk ? undefined : 'lệch sản phẩm'}
              />
              <PrepRow
                label="Link affiliate của anh"
                state={affiliateOk ? 'ok' : 'wait'}
                note={affiliateOk ? undefined : 'kiểm owner'}
              />
              <PrepRow label="Đủ nội dung bài đăng" state={pkgState} note={pkgNote} />
              <PrepRow label="Đã tạo gói bài đăng" state={pkgState} note={pkgNote} />
              <PrepRow label="Facebook" state={fbState} note={fbNote} />
              <PrepRow label="Bản nháp đăng bài đã sẵn sàng" state={pkgState} note={pkgNote} />
              <PrepRow
                label="Sẵn sàng đăng"
                state={pkgState}
                note={packaged ? (published ? 'đã đăng' : 'đăng thủ công (Phase C)') : pkgNote}
              />
            </div>
          );
        })()}

        {publishPreflight && !publishPreflight.livePublishEnabled && (
          <p className="text-[10px] leading-relaxed text-neutral-500">
            Facebook đang ở <strong className="text-accent-amber">chế độ nháp</strong> — chưa bật
            đăng thật. Bản nháp bài đăng vẫn được chuẩn bị; bước đăng thật (live publish) làm ở
            Phase C với gate cứng.
          </p>
        )}

        {latestJob?.state === 'PACKAGED' && (
          <div className="rounded-lg border border-hairline bg-panel/60 p-4 space-y-3.5">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold border-b border-hairline pb-1.5">
              Xem trước bài đăng Facebook
            </div>

            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-xs font-semibold text-neutral-300">
                FB
              </div>
              <div>
                <div className="text-xs font-bold text-neutral-100">
                  {packagePreview?.pageName || 'Review Nhà bạn'}
                </div>
                <div className="text-[10px] text-neutral-500 font-medium flex items-center gap-1">
                  <span>🌐</span>
                  <span>Bản nháp · Chưa đăng</span>
                </div>
              </div>
            </div>

            {/* Content Text */}
            <div className="text-xs text-neutral-200 leading-relaxed space-y-2 whitespace-pre-wrap">
              {packagePreview ? (
                <>
                  <p>{packagePreview.caption}</p>
                  {packagePreview.hashtags &&
                    !captionContainsHashtags(packagePreview.caption, packagePreview.hashtags) && (
                      <p className="text-accent-blue font-medium">{packagePreview.hashtags}</p>
                    )}
                  {packagePreview.affiliateLink && (
                    <p className="text-accent-cyan break-all underline">
                      {packagePreview.affiliateLink}
                    </p>
                  )}
                </>
              ) : loadingPreview ? (
                <p className="text-neutral-500 italic">Đang tải bản xem trước...</p>
              ) : (
                <p className="text-neutral-500 italic">Không thể tải nội dung bản nháp bài đăng.</p>
              )}
            </div>

            {/* Media (Video) */}
            <div className="space-y-1">
              <div className="text-[10px] text-neutral-500 font-semibold">
                Preview video đã đóng gói
              </div>
              {latestJob?.previewUrl ? (
                <div className="relative aspect-video overflow-hidden rounded border border-hairline bg-black">
                  {/* biome-ignore lint/a11y/useMediaCaption: video is a local preview with only ambient audio or baked-in captions */}
                  <video
                    src={latestJob.previewUrl}
                    controls
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center p-8 bg-neutral-900 border border-hairline rounded text-neutral-500 text-xs">
                  🎥 Video đã đóng gói
                </div>
              )}
            </div>

            {/* Copy Button */}
            {packagePreview && (
              <div className="flex justify-end pt-1">
                <Button
                  variant="outline"
                  className="!py-1 !px-2.5 text-[10px] font-semibold"
                  onClick={async () => {
                    const hasDupHashtags = captionContainsHashtags(
                      packagePreview.caption,
                      packagePreview.hashtags,
                    );
                    const fullText = [
                      packagePreview.caption,
                      hasDupHashtags ? null : packagePreview.hashtags,
                      packagePreview.affiliateLink,
                    ]
                      .filter(Boolean)
                      .join('\n\n');
                    try {
                      await navigator.clipboard.writeText(fullText);
                      setCopiedCaption(true);
                      setTimeout(() => setCopiedCaption(false), 2000);
                    } catch {
                      // Clipboard fail
                    }
                  }}
                >
                  {copiedCaption ? '✓ Đã copy bài viết' : 'Copy bài viết'}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Flow chính Action 3 chỉ có 1 CTA cuối: "Đăng bài Facebook" (Phase C, gate cứng).
            Phase C UX: bấm nút khi gate xanh → đăng luôn, KHÔNG modal confirm phrase.
            Server vẫn evaluateLivePublishGates trước khi đăng. Retry kín đáo ở "Chi tiết kỹ thuật". */}
        <PanelActions>
          {latestJob?.state === 'PUBLISHED' ||
          publishPreflight?.alreadyPublished ||
          publishResult?.ok ? (
            <div className="flex w-full flex-col gap-1.5">
              <Button variant="success" disabled className="!py-1.5 !px-3 text-xs font-semibold">
                ✓ Đã đăng thành công
              </Button>
              {publishResult?.result?.permalinkUrl && (
                <a
                  href={publishResult.result.permalinkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-accent-green underline hover:text-accent-green/80"
                >
                  Xem bài đăng trên Facebook (đã verify qua Graph readback) ↗
                </a>
              )}
            </div>
          ) : (
            <div className="flex w-full flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant={canPublish ? 'danger' : 'outline'}
                  disabled={!canPublish || submittingPublish}
                  onClick={() => handleLivePublish(selectedJobId)}
                  className="!py-1.5 !px-3 text-xs font-semibold"
                >
                  {submittingPublish ? (
                    <span className="flex items-center gap-1.5">
                      <span className="animate-spin">
                        <UtilIcon name="clock" width={13} height={13} />
                      </span>
                      Đang đăng...
                    </span>
                  ) : (
                    'Đăng bài Facebook'
                  )}
                </Button>
                {!canPublish && !submittingPublish && (
                  <span className="text-[10px] text-neutral-500 font-medium">
                    {getPublishDisabledReason()}
                  </span>
                )}
              </div>
              {publishError && (
                <div className="rounded-lg border border-accent-rose/30 bg-accent-rose/5 px-3 py-2 space-y-1 text-[11px]">
                  <div className="flex items-center gap-2 font-semibold text-accent-rose">
                    <UtilIcon name="x" width={13} height={13} />
                    <span>Đăng bài thất bại</span>
                  </div>
                  <p className="text-neutral-300">{publishError}</p>
                  {publishStderr && (
                    <pre className="mt-1 max-h-32 overflow-auto rounded bg-neutral-950/80 p-2 text-[10px] text-neutral-500 font-mono whitespace-pre-wrap">
                      {publishStderr}
                    </pre>
                  )}
                  <p className="text-[10px] text-neutral-500">
                    Bấm lại nút để thử đăng lại nếu gate vẫn xanh — VFOS không tự động đăng lại.
                  </p>
                </div>
              )}
            </div>
          )}
        </PanelActions>

        {/* Chi tiết kỹ thuật — KHÔNG phải flow chính của Operator (debug/detail). */}
        <details className="border-t border-hairline/50 pt-2">
          <summary className="cursor-pointer text-[10px] text-neutral-500 hover:text-neutral-300">
            Chi tiết kỹ thuật
          </summary>
          <div className="space-y-2 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <DebugLink href="/publish?lane=product-review">Mở publish (debug)</DebugLink>
              {latestJob && (
                <span className="font-mono text-[10px] text-neutral-600">
                  state: {latestJob.state}
                </span>
              )}
              {jobApproved &&
                latestJob &&
                !preparingPost &&
                !publishPreflight?.alreadyPublished && (
                  <button
                    type="button"
                    onClick={() => preparePost(latestJob.id)}
                    className="rounded border border-hairline/60 px-2 py-1 text-[10px] text-neutral-400 transition hover:text-neutral-200"
                  >
                    Thử chuẩn bị lại
                  </button>
                )}
            </div>
            {preparePostDetails && (
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded border border-hairline/60 bg-panel/40 p-2 text-[9px] leading-relaxed text-neutral-500">
                {preparePostDetails}
              </pre>
            )}
          </div>
        </details>

        <GateHint
          ok={latestJob?.state === 'PACKAGED' || !!publishPreflight?.alreadyPublished}
          okText="Bản nháp bài đăng đã sẵn sàng (PACKAGED) — đăng thủ công ở Phase C"
          waitText="VFOS sẽ tự đóng gói sau khi Operator duyệt video; hoàn tất khi job đạt PACKAGED"
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

// ok = xong | doing = đang làm | wait = chưa sẵn sàng | warn = cảnh báo | fail = lỗi
type PrepState = 'ok' | 'doing' | 'wait' | 'warn' | 'fail';

const PREP_DOT: Record<PrepState, string> = {
  ok: 'bg-accent-green',
  doing: 'bg-accent-blue',
  wait: 'bg-neutral-600',
  warn: 'bg-accent-amber',
  fail: 'bg-accent-rose',
};
const PREP_LABEL_CLS: Record<PrepState, string> = {
  ok: 'text-neutral-200',
  doing: 'text-accent-blue',
  wait: 'text-neutral-500',
  warn: 'text-accent-amber',
  fail: 'text-accent-rose',
};
const PREP_NOTE_CLS: Record<PrepState, string> = {
  ok: 'text-neutral-600',
  doing: 'text-accent-blue',
  wait: 'text-neutral-600',
  warn: 'text-accent-amber',
  fail: 'text-accent-rose',
};

/** Một dòng checklist chuẩn bị bài đăng (Action 3): ok/doing/wait/warn/fail + ghi chú. */
function PrepRow({ label, state, note }: { label: string; state: PrepState; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-hairline/60 bg-panel/40 px-2.5 py-1.5 text-[11px]">
      <span className="flex min-w-0 items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PREP_DOT[state]}`} />
        <span className={`truncate ${PREP_LABEL_CLS[state]}`}>{label}</span>
      </span>
      {state === 'ok' ? (
        <span className="flex shrink-0 items-center gap-1 text-accent-green">
          <UtilIcon name="check" width={11} height={11} /> OK
        </span>
      ) : note ? (
        <span className={`shrink-0 text-right text-[10px] ${PREP_NOTE_CLS[state]}`}>{note}</span>
      ) : null}
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
