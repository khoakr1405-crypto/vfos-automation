import { UtilIcon, type UtilIconKey } from '@/components/icons';

/**
 * ProcessStrip — dải "Quy trình vận hành chuẩn" (redesign concept 07/2026).
 * THUẦN nhãn quy trình (không số liệu) — mô tả 6 bước chuẩn của vòng sản xuất
 * để Operator mới nhìn phát hiểu pipeline. Read-only, không link hành động.
 */

const STEPS: Array<{ label: string; sub: string; icon: UtilIconKey; tone: string; tile: string }> =
  [
    {
      label: 'Lấy / chọn sản phẩm',
      sub: 'Tạo Product Card',
      icon: 'search',
      tone: 'text-green-400',
      tile: 'border-accent-green/40 bg-accent-green/15 text-accent-green',
    },
    {
      label: 'Nguồn sạch',
      sub: 'Chuẩn bị tài nguyên',
      icon: 'link',
      tone: 'text-blue-400',
      tile: 'border-accent-blue/40 bg-accent-blue/15 text-accent-blue',
    },
    {
      label: 'Sản xuất + QA',
      sub: 'Sản xuất nội dung',
      icon: 'play',
      tone: 'text-violet-400',
      tile: 'border-accent-violet/40 bg-accent-violet/15 text-accent-violet',
    },
    {
      label: 'Duyệt preview',
      sub: 'Kiểm tra & duyệt',
      icon: 'check',
      tone: 'text-amber-400',
      tile: 'border-accent-amber/40 bg-accent-amber/15 text-accent-amber',
    },
    {
      label: 'Đóng gói',
      sub: 'Render & Caption',
      icon: 'download',
      tone: 'text-cyan-400',
      tile: 'border-accent-cyan/40 bg-accent-cyan/15 text-accent-cyan',
    },
    {
      label: 'Đã đăng',
      sub: 'Publish khi Operator bấm',
      icon: 'sparkle',
      tone: 'text-green-400',
      tile: 'border-accent-green/40 bg-accent-green/15 text-accent-green',
    },
  ];

export function ProcessStrip() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      {STEPS.map((s, i) => (
        <div
          key={s.label}
          className="flex items-center gap-2.5 rounded-xl border border-hairline/60 bg-panel/70 px-3 py-2.5 transition-colors duration-300 ease-in-out hover:border-hairline"
        >
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${s.tile}`}
          >
            <UtilIcon name={s.icon} width={13} height={13} />
          </span>
          <span className="min-w-0">
            <span className={`block truncate text-[11px] font-semibold ${s.tone}`}>
              <span className="mr-1 font-mono text-neutral-500">{i + 1}</span>
              {s.label}
            </span>
            <span className="block truncate text-[10px] text-neutral-500">{s.sub}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
