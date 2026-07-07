/* =============================================================================
 * VFOS Studio — Entertainment Command Center (Lane 2: Nội dung / Giải trí)
 * -----------------------------------------------------------------------------
 * Giao diện vận hành 3 PHẦN / ĐÚNG 4 NÚT cho Operator dễ dùng, NHƯNG bên trong
 * vẫn là workflow 8 bước + 1 cổng Duyệt video theo
 * docs/00_DIEU_HANH/VFOS_ENTERTAINMENT_LANE_SPEC.md:
 *   source intake → analyze → montage → transcreation → voice/caption →
 *   audio mix → preview → package.
 *
 * ĐÚNG 4 NÚT (E-UI-7 gom nút · E-UI-8 gộp 1 cổng):
 *   1) Tải link  2) Sản xuất video  3) Duyệt video  4) Đăng lên Facebook
 * 1 ô chọn job DÙNG CHUNG cho cả 3 phần (EntJobSelector). "Sản xuất video" chạy
 * NGUYÊN chuỗi analyze→montage→script→voice→audio (1 process) rồi DỪNG ở CỔNG DUY
 * NHẤT = Duyệt video. KHÔNG còn cổng duyệt script (đã gộp). Video chỉ hiện khi
 * render XONG HẲN (không hiện giữa chừng). Nút 4 = đóng gói đăng TAY lên Facebook
 * Reels (đổi target từ TikTok) + contextual affiliate tuỳ chọn. KHÔNG auto publish
 * — Duyệt video + đăng tay vẫn là cổng tay.
 *
 * Isolation: page riêng, KHÔNG tái dùng component Product Review, KHÔNG đụng
 * /lanes/product-review, jobs/[jobId], orchestrator, Product Card, nav.ts.
 * ========================================================================== */

import { Badge } from '@/components/badge';
import { Card, CardBody } from '@/components/card';
import {
  ChannelOverview,
  ChannelSwitcher,
} from '@/components/entertainment/channel-switcher';
import { EntJobSelector, EntLaneProvider } from '@/components/entertainment/ent-lane-context';
import { IntakePanel } from '@/components/entertainment/intake-panel';
import { PackagePanel } from '@/components/entertainment/package-panel';
import { ProductionPanel } from '@/components/entertainment/production-panel';
import { PageHeader } from '@/components/page-header';

// Workflow 8 bước đầy đủ (mục expandable cho dev/operator xem sâu).
const FULL_WORKFLOW: Array<{ no: number; label: string; note: string; gate?: string }> = [
  { no: 1, label: 'Source Intake', note: 'Tải source no-watermark + metadata (nút "Tải link").' },
  {
    no: 2,
    label: 'Analyze + Clip Mining',
    note: 'Vision-anchored: tìm money-shot bằng hình, ASR bám nhịp.',
  },
  { no: 3, label: 'Montage Build', note: 'Dựng visual base: lead-up + money-shot + reaction.' },
  {
    no: 4,
    label: 'Script — Transcreation',
    note: 'Bám lời/nhịp gốc, Việt hóa, tag source-bound/micro. Chạy ngầm — không còn cổng duyệt script (gộp).',
  },
  {
    no: 5,
    label: 'Voice + Caption Sync',
    note: 'Edge TTS (swappable ElevenLabs); hash voice==caption, overlap=0.',
  },
  {
    no: 6,
    label: 'Audio Mix',
    note: 'remove_speech_keep_ambient (Demucs no_vocals + ducking). KHÔNG fallback — khóa cứng: chưa áp thật thì chặn duyệt/đóng gói.',
  },
  {
    no: 7,
    label: 'Preview',
    note: 'Player + QA checklist (chỉ hiện khi render xong hẳn).',
    gate: 'CỔNG DUY NHẤT — Operator duyệt video',
  },
  {
    no: 8,
    label: 'Package',
    note: 'Final mp4 + caption + hashtag + hướng dẫn đăng tay (nút "Đóng gói").',
  },
];

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
    <EntLaneProvider>
      <div className="space-y-6">
        <PageHeader
          no={3}
          icon="rawvisual"
          accent="cyan"
          title="Nội dung / Giải trí — Command Center"
          description="Lane reup biến đổi → Việt hóa, quản nhiều kênh/tài khoản TikTok. Chọn kênh trước — job khoá theo kênh, không đăng nhầm."
          actions={<ChannelSwitcher />}
        />

        {/* Kênh / Tài khoản — chọn kênh active, lọc lane theo kênh (chống nhầm account) */}
        <Card>
          <CardBody className="space-y-3 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-neutral-100">Kênh / Tài khoản TikTok</h2>
                <p className="text-[11px] text-neutral-500">
                  Bấm 1 kênh để lọc lane theo kênh đó · "Tất cả kênh" để xem chung. Mỗi job khoá
                  theo kênh — chỉ đăng đúng tài khoản của kênh.
                </p>
              </div>
              <Badge accent="cyan">R2</Badge>
            </div>
            <ChannelOverview />
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3 text-[11px] text-neutral-500">
            <EntJobSelector />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <span>audioMode: remove_speech_keep_ambient</span>
              <span>Không Product Card · Affiliate contextual (tuỳ chọn) · Không auto-publish</span>
            </div>
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
              Dán URL Douyin/TikTok → tạo job giải trí, tải source no-watermark, lưu metadata. Không
              Product Card, không affiliate.
            </p>
            <IntakePanel />
          </CardBody>
        </Card>

        {/* BƯỚC 2 — Sản xuất video (chứa 8-bước nội bộ + 1 cổng Duyệt video) */}
        <Card className="ring-1 ring-accent-amber/20">
          <CardBody className="space-y-3 p-6">
            <div className="flex items-start justify-between gap-3">
              <StepHeader
                no={2}
                title="Sản xuất video"
                sub="1 nút chạy nguyên chuỗi → 1 cổng Duyệt video"
              />
              <Badge accent="cyan">E-UI-8</Badge>
            </div>
            <p className="text-xs leading-relaxed text-neutral-400">
              Bấm <strong>Sản xuất video</strong> → chạy ngầm NGUYÊN chuỗi analyze → montage →
              script → voice → audio. <strong>Không còn cổng duyệt script</strong> (đã gộp). Video{' '}
              <strong>chỉ hiện khi render xong hẳn</strong>; xem rồi bấm{' '}
              <strong>Duyệt video</strong> — cổng tay duy nhất. KHÔNG auto-publish.
            </p>
            {/* Progress line per-step (đèn trạng thái runtime thật) nằm trong
                ProductionPanel — thay cho timeline tĩnh trước đây. */}
            <ProductionPanel />
          </CardBody>
        </Card>

        {/* BƯỚC 3 — Đóng gói & đăng Facebook (đổi target từ TikTok) */}
        <Card>
          <CardBody className="space-y-3 p-6">
            <div className="flex items-start justify-between gap-3">
              <StepHeader no={3} title="Đăng lên Facebook" sub="1 nút: đóng gói → đăng tay" />
              <Badge accent="cyan">E-UI-7</Badge>
            </div>
            <p className="text-xs leading-relaxed text-neutral-400">
              1 nút <strong>Đăng lên Facebook</strong>: xuất final mp4 + caption + hashtag +
              (tuỳ chọn) affiliate link theo ngữ cảnh.{' '}
              <strong className="text-neutral-300">Hiện đăng TAY, KHÔNG auto-publish.</strong>{' '}
              Affiliate là <strong>contextual</strong> (không bắt Product Card, owner chỉ cảnh báo
              mềm). Mặc định MOCK — live cần credential + GO riêng.
            </p>
            <PackagePanel />
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
                  Skeleton E-UI-1 — engine CLI (scripts/ent-vlog) đã chạy thật bước 1–6; E-UI-2…6
                  nối từng nút vào API namespace riêng /api/studio/entertainment. Spec:
                  docs/00_DIEU_HANH/VFOS_ENTERTAINMENT_LANE_SPEC.md
                </p>
              </div>
            </details>
          </CardBody>
        </Card>
      </div>
    </EntLaneProvider>
  );
}
