/** Persistent reminder that this is a UI shell with mock data only. */
export function MockBanner() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-accent-amber/30 bg-accent-amber/10 px-3.5 py-2 text-[11px] text-accent-amber">
      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent-amber" />
      <span>
        <strong>UI SHELL · DỮ LIỆU MOCK.</strong> Round UI-01 — chưa nối backend, chưa gọi API thật,
        chưa publish thật.
      </span>
    </div>
  );
}
