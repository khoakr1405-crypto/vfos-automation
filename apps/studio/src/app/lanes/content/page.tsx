/* =============================================================================
 * VFOS Studio — Entertainment Command Center (Lane 2: Nội dung / Giải trí)
 * -----------------------------------------------------------------------------
 * Phase E-UI-1 — UI SKELETON ONLY. Giao diện vận hành 3 BƯỚC / 3 NÚT LỚN cho
 * Operator dễ dùng, NHƯNG bên trong vẫn là workflow 8 bước + 2 gate theo
 * docs/00_DIEU_HANH/VFOS_ENTERTAINMENT_LANE_SPEC.md:
 *   source intake → analyze → montage → transcreation → voice/caption →
 *   audio mix → preview → package.
 *
 * 3 nút lớn:  1) Tải link   2) Sản xuất video   3) Đóng gói & hướng dẫn đăng tay
 * 2 gate Operator (duyệt script + duyệt preview) nằm BÊN TRONG bước 2.
 * KHÔNG action thật, KHÔNG data thật, KHÔNG gọi pipeline/API — mỗi nút ghi rõ
 * phase sẽ wire (E-UI-2..6). KHÔNG auto publish TikTok ở phase này.
 *
 * Isolation: page riêng, KHÔNG tái dùng component Product Review, KHÔNG đụng
 * /lanes/product-review, jobs/[jobId], orchestrator, Product Card, nav.ts.
 * ========================================================================== */

import { Badge } from '@/components/badge';
import { Card, CardBody } from '@/components/card';
import { PageHeader } from '@/components/page-header';

// 7 sub-step bên trong nút "Sản xuất video" (intake = nút 1, package = nút 3).
const PRODUCE_SUBSTEPS: Array<{ label: string; gate?: boolean }> = [
  { label: 'Analyze (vision-anchored)' },
  { label: 'Montage' },
  { label: 'Script — Transcreation', gate: true },
  { label: 'Voice' },
  { label: 'Caption sync' },
  { label: 'Audio mix' },
  { label: 'Preview', gate: true },
];

// Workflow 8 bước đầy đủ (mục expandable cho dev/operator xem sâu).
const FULL_WORKFLOW: Array<{ no: number; label: string; note: string; gate?: string }> = [
  { no: 1, label: 'Source Intake', note: 'Tải source no-watermark + metadata (nút "Tải link").' },
  { no: 2, label: 'Analyze + Clip Mining', note: 'Vision-anchored: tìm money-shot bằng hình, ASR bám nhịp.' },
  { no: 3, label: 'Montage Build', note: 'Dựng visual base: lead-up + money-shot + reaction.' },
  { no: 4, label: 'Script — Transcreation', note: 'Bám lời/nhịp gốc, Việt hóa, tag source-bound/micro.', gate: 'GATE 1 — Operator duyệt script' },
  { no: 5, label: 'Voice + Caption Sync', note: 'Edge TTS (swappable ElevenLabs); hash voice==caption, overlap=0.' },
  { no: 6, label: 'Audio Mix', note: 'remove_speech_keep_ambient (Demucs no_vocals + ducking); fallback stock/mute.' },
  { no: 7, label: 'Preview', note: 'Player + QA checklist.', gate: 'GATE 2 — Operator duyệt preview' },
  { no: 8, label: 'Package', note: 'Final mp4 + caption + hashtag + hướng dẫn đăng tay (nút "Đóng gói").' },
];

function NicheSelector() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-lg border border-accent-cyan/40 bg-accent-cyan/10 px-3 py-1.5 text-xs font-semibold text-accent-cyan">
        🎣 Vlog Câu cá
      </span>
      <span className="rounded-lg border border-hairline/60 px-3 py-1.5 text-xs text-neutral-600">
        🚗 Vlog Về xe <span className="ml-1 text-[10px] text-neutral-700">(roadmap)</span>
      </span>
    </div>
  );
}

/** Nút lớn disabled — sẽ wire ở phase tương ứng. */
function BigButton({ label, phase }: { label: string; phase: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span
        aria-disabled="true"
        className="cursor-not-allowed select-none rounded-xl border border-hairline/70 bg-panel/50 px-5 py-2.5 text-sm font-bold text-neutral-500"
        title={`Sẽ bật ở ${phase}`}
      >
        {label}
      </span>
      <span className="text-[11px] text-neutral-600">Chưa bật — wire ở {phase}</span>
    </div>
  );
}

function StepHeader({ no, title, sub }: { no: number; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-cyan/15 text-base font-bold text-accent-cyan">
        {no}
      </span>
      <div>
        <h2 className="text-base font-bold text-neutral-100">{title}</h2>
        <p className="text-xs text-neutral-500">{sub}</p>
      </div>
    </div>
  );
}

// biome-ignore lint/style/noDefaultExport: Next.js page requires default export
export default function ContentLanePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        no={3}
        icon="rawvisual"
        accent="cyan"
        title="Nội dung / Giải trí — Command Center"
        description="Lane reup biến đổi → Việt hóa. Phase E-UI-1: khung 3 bước (skeleton), chưa bật action."
        actions={<NicheSelector />}
      />

      <Card>
        <CardBody className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 text-[11px] text-neutral-500">
          <span className="font-semibold text-neutral-300">3 bước vận hành · 8 bước nội bộ · 2 gate</span>
          <span>audioMode: remove_speech_keep_ambient</span>
          <span>Không Product Card · Không affiliate · Không auto-publish TikTok</span>
        </CardBody>
      </Card>

      {/* BƯỚC 1 — Tải link */}
      <Card>
        <CardBody className="space-y-3 p-6">
          <div className="flex items-start justify-between gap-3">
            <StepHeader no={1} title="Tải link" sub="Tạo job + tải source từ nguồn ngoài" />
            <Badge accent="cyan">E-UI-2</Badge>
          </div>
          <p className="text-xs leading-relaxed text-neutral-400">
            Dán URL Douyin/TikTok hoặc đường dẫn file local → tạo job giải trí, tải source
            no-watermark, lưu metadata. Không Product Card, không affiliate.
          </p>
          <input
            disabled
            placeholder="Dán URL Douyin/TikTok hoặc đường dẫn file…"
            className="w-full cursor-not-allowed rounded-lg border border-hairline/60 bg-panel/40 px-3 py-2 text-xs text-neutral-500 placeholder:text-neutral-600"
          />
          <BigButton label="Tải link" phase="E-UI-2" />
        </CardBody>
      </Card>

      {/* BƯỚC 2 — Sản xuất video (chứa 8-bước nội bộ + 2 gate) */}
      <Card className="ring-1 ring-accent-amber/20">
        <CardBody className="space-y-3 p-6">
          <div className="flex items-start justify-between gap-3">
            <StepHeader
              no={2}
              title="Sản xuất video"
              sub="Analyze → Montage → Script → Voice → Caption → Audio mix → Preview"
            />
            <Badge accent="cyan">E-UI-3…5</Badge>
          </div>
          <p className="text-xs leading-relaxed text-neutral-400">
            Hệ thống tự chạy chuỗi sub-step bên trong. Có <strong>2 điểm dừng chờ Operator
            duyệt</strong>: duyệt <strong>script</strong> trước khi voice/render, và duyệt{' '}
            <strong>preview</strong> trước khi đóng gói.
          </p>
          {/* Timeline sub-step thu gọn */}
          <div className="flex flex-wrap items-center gap-1.5">
            {PRODUCE_SUBSTEPS.map((s, i) => (
              <span key={s.label} className="flex items-center gap-1.5">
                <span
                  className={`rounded-md px-2 py-1 text-[10px] font-medium ${
                    s.gate
                      ? 'border border-accent-amber/40 bg-accent-amber/10 text-accent-amber'
                      : 'border border-hairline/50 bg-panel/40 text-neutral-400'
                  }`}
                >
                  {s.gate ? '⛔ ' : ''}
                  {s.label}
                </span>
                {i < PRODUCE_SUBSTEPS.length - 1 && <span className="text-neutral-700">›</span>}
              </span>
            ))}
          </div>
          <BigButton label="Sản xuất video" phase="E-UI-3…5" />
        </CardBody>
      </Card>

      {/* BƯỚC 3 — Đóng gói & hướng dẫn đăng tay */}
      <Card>
        <CardBody className="space-y-3 p-6">
          <div className="flex items-start justify-between gap-3">
            <StepHeader
              no={3}
              title="Đăng TikTok"
              sub="Đóng gói & hướng dẫn đăng tay"
            />
            <Badge accent="cyan">E-UI-6</Badge>
          </div>
          <p className="text-xs leading-relaxed text-neutral-400">
            Xuất final mp4 + caption đề xuất + hashtag đề xuất + checklist đăng thủ công.{' '}
            <strong className="text-neutral-300">KHÔNG auto-publish.</strong> Auto-publish TikTok là
            phase riêng sau này (cần TikTok API/token + safety gate).
          </p>
          <BigButton label="Đóng gói & hướng dẫn đăng" phase="E-UI-6" />
        </CardBody>
      </Card>

      {/* Expandable — chi tiết workflow 8 bước (dev/operator xem sâu) */}
      <Card>
        <CardBody className="p-0">
          <details className="group">
            <summary className="flex cursor-pointer items-center justify-between px-5 py-3 text-xs font-semibold text-neutral-300">
              <span>Chi tiết workflow 8 bước (dev/operator)</span>
              <span className="text-neutral-600 transition group-open:rotate-90">›</span>
            </summary>
            <div className="space-y-2 border-t border-hairline/40 px-5 py-4">
              {FULL_WORKFLOW.map((step) => (
                <div key={step.no} className="flex gap-3 text-[11px]">
                  <span className="w-4 shrink-0 font-bold text-neutral-500">{step.no}</span>
                  <div>
                    <span className="font-semibold text-neutral-300">{step.label}</span>
                    {step.gate && (
                      <span className="ml-2 rounded bg-accent-amber/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-amber">
                        ⛔ {step.gate}
                      </span>
                    )}
                    <p className="mt-0.5 text-neutral-500">{step.note}</p>
                  </div>
                </div>
              ))}
              <p className="border-t border-hairline/40 pt-2 text-[10px] text-neutral-600">
                Skeleton E-UI-1 — engine CLI (scripts/ent-vlog) đã chạy thật bước 1–6; E-UI-2…6 nối
                từng nút vào API namespace riêng /api/studio/entertainment. Spec:
                docs/00_DIEU_HANH/VFOS_ENTERTAINMENT_LANE_SPEC.md
              </p>
            </div>
          </details>
        </CardBody>
      </Card>
    </div>
  );
}
