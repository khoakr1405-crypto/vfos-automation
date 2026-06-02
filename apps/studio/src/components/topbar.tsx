import { SHOPEE_OWNER } from '@/lib/mock-data';
import { UtilIcon } from './icons';

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-hairline bg-canvas/80 px-5 py-3 backdrop-blur">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex w-full max-w-md items-center gap-2 rounded-lg border border-hairline bg-panel/80 px-3 py-2 text-neutral-500">
          <UtilIcon name="search" />
          <input
            type="text"
            placeholder="Tìm sản phẩm, link, job, kênh…"
            className="w-full bg-transparent text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none"
          />
        </div>
      </div>

      <button
        type="button"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-hairline bg-panel/80 text-neutral-400 transition hover:text-neutral-100"
        aria-label="Thông báo"
      >
        <UtilIcon name="bell" />
        <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent-rose" />
      </button>

      <div className="flex items-center gap-2.5 rounded-lg border border-hairline bg-panel/80 px-2.5 py-1.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-accent-blue to-accent-violet text-[11px] font-bold text-white">
          AN
        </span>
        <div className="hidden leading-tight sm:block">
          <p className="font-mono text-[11px] text-neutral-200">{SHOPEE_OWNER}</p>
          <p className="text-[10px] text-accent-green">Owner · Shopee Affiliate</p>
        </div>
      </div>
    </header>
  );
}
