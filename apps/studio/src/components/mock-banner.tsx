/** Persistent reminder: which panels are real vs mock (Round UI-02). */
export function MockBanner() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-accent-amber/30 bg-accent-amber/10 px-3.5 py-2 text-[11px] text-accent-amber">
      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent-amber" />
      <span>
        <strong>UI-02 · READ-ONLY.</strong> Video Job Queue + Product Queue đọc{' '}
        <strong>job thật</strong> (registry/manifest). Analytics, cụm kênh, KPI, hoạt động tuần,
        publish readiness vẫn <strong>mock</strong>. Chưa approve/reject thật, chưa publish, chưa
        gọi API ngoài.
      </span>
    </div>
  );
}
