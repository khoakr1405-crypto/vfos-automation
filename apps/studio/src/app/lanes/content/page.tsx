'use client';

/* =============================================================================
 * VFOS Studio — Lane 2: Nội dung / Giải trí (ROADMAP — UI Architecture V1)
 * -----------------------------------------------------------------------------
 * Lane 2 theo North Star v2: Operator add video nguồn nước ngoài/Trung Quốc,
 * VFOS phân tích nội dung gốc → dịch/chuyển ngữ tự nhiên → edit/biến đổi cho
 * thị trường VN (không bị nhận diện reup đơn thuần) → gắn affiliate theo ngữ
 * cảnh (1 link chủ đạo + 2 link comment). Vlog Câu cá / Vlog Về xe là các
 * NGÁCH bên trong lane này — không phải lane riêng.
 *
 * Trang này là placeholder roadmap: CHƯA bật pipeline thật, không nút action
 * thật, không mock data giả làm data thật. Triển khai thật ở Phase F (sau khi
 * lane Review Sản phẩm chạy vòng lặp mượt) — xem VFOS_UI_ARCHITECTURE_V1.md.
 * ========================================================================== */

import { Card, CardBody, CardHeader } from '@/components/card';
import { PageHeader } from '@/components/page-header';

const PLANNED_NICHES = [
  {
    name: 'Vlog Về Câu cá',
    note: 'Nội dung câu cá giải trí — CTA/affiliate đồ câu theo ngữ cảnh, không biến vlog thành review thô.',
  },
  {
    name: 'Vlog Về xe',
    note: 'Nội dung xe/chăm sóc xe — product/CTA đúng tệp người xem, không gắn nhầm sản phẩm lane khác.',
  },
] as const;

// biome-ignore lint/style/noDefaultExport: Next.js page requires default export
export default function ContentLanePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        no={3}
        icon="rawvisual"
        accent="cyan"
        title="Nội dung / Giải trí"
        description="Lane 2 theo North Star — ROADMAP, chưa bật pipeline thật. Triển khai ở Phase F sau khi lane Review Sản phẩm chạy vòng lặp mượt."
      />

      <Card>
        <CardHeader
          title="Lane này sẽ vận hành thế nào"
          subtitle="Content-led affiliate — nội dung kéo view trước, gắn link theo ngữ cảnh sau"
          accentClass="text-accent-cyan"
        />
        <CardBody className="p-6 text-xs text-neutral-400 space-y-4">
          <p className="font-semibold text-neutral-200">
            Tái dùng khung 3 Action + vòng lặp 9 bước của lane Review Sản phẩm:
          </p>
          <ol className="list-decimal pl-4 space-y-1.5 text-neutral-300">
            <li>Chọn ngách + kênh → add video nguồn nước ngoài</li>
            <li>
              Phân tích nội dung gốc → dịch/chuyển ngữ tự nhiên → edit/voice/caption/QA (chuẩn
              localization North Star §3)
            </li>
            <li>
              Duyệt preview → gắn affiliate theo ngữ cảnh (1 link chủ đạo + 2 link comment) →
              package → publish qua gate cứng
            </li>
          </ol>
          <p className="text-neutral-500 pt-2 border-t border-hairline/40">
            Chưa bật pipeline thật cho lane này — không có nút action thật ở đây cho tới Phase F.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Ngách đã quy hoạch trong lane"
          subtitle="Mỗi ngách sẽ có cấu hình kênh riêng ở màn Ngách & Kênh (Phase D)"
          accentClass="text-accent-cyan"
        />
        <CardBody className="p-6 space-y-3">
          {PLANNED_NICHES.map((niche) => (
            <div
              key={niche.name}
              className="rounded-lg border border-hairline/60 bg-panel/40 px-4 py-3"
            >
              <p className="text-xs font-bold text-neutral-200">
                {niche.name}{' '}
                <span className="ml-2 rounded bg-accent-cyan/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-cyan">
                  ROADMAP
                </span>
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">{niche.note}</p>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
