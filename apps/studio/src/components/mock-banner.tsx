/** Persistent reminder: which panels are real vs mock/fixture. */
export function MockBanner() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-accent-amber/30 bg-accent-amber/10 px-3.5 py-2 text-[11px] text-accent-amber">
      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent-amber" />
      <span>
        <strong>PHẠM VI DỮ LIỆU.</strong> Job/Product đọc <strong>thật</strong>{' '}
        (registry/manifest). Lane Review Sản phẩm: approve / production / publish Facebook{' '}
        <strong>thật</strong> qua gate cứng — live publish chỉ chạy khi Operator bấm. Analytics,
        cụm kênh, KPI, hoạt động tuần vẫn <strong>mock/fixture</strong>.
      </span>
    </div>
  );
}
