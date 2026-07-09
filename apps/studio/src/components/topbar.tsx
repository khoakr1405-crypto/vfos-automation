import { SHOPEE_OWNER } from '@/lib/mock-data';
import { UtilIcon } from './icons';

/**
 * Topbar (redesign concept 07/2026) — search + bộ lọc + owner.
 *
 * Các <select> là shell trình bày (CHƯA nối filter logic), nên chỉ để option
 * TRUNG THỰC "Tất cả …" — KHÔNG bịa danh sách sản phẩm/cụm giả (No-Go #6). Owner
 * ID là data THẬT (an_17376660568).
 */
export function Topbar() {
  return (
    <header className="flex flex-col gap-4 border-b border-hairline bg-canvas/80 px-5 py-3 backdrop-blur lg:flex-row lg:items-center">
      {/* Search & Filters */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex w-full max-w-xs items-center gap-2 rounded-lg border border-hairline bg-panel/80 px-3 py-2 text-neutral-500 transition-colors duration-300 focus-within:border-accent-violet/50">
          <UtilIcon name="search" />
          <input
            type="text"
            placeholder="Tìm sản phẩm, link, job, kênh…"
            className="w-full bg-transparent text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none"
          />
        </div>

        {/* Filter Dropdowns — chỉ option trung thực, chưa nối logic filter. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-hairline bg-raised/40 px-2.5 py-1 text-xs transition-colors duration-300 hover:border-hairline">
            <span className="font-medium text-neutral-500">Khoảng thời gian:</span>
            <select className="cursor-pointer border-0 bg-transparent p-0 text-[11px] font-medium text-neutral-300 focus:outline-none">
              <option value="7d">7 ngày qua</option>
              <option value="30d">30 ngày qua</option>
              <option value="90d">90 ngày qua</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-hairline bg-raised/40 px-2.5 py-1 text-xs transition-colors duration-300 hover:border-hairline">
            <span className="font-medium text-neutral-500">Cụm kênh:</span>
            <select className="cursor-pointer border-0 bg-transparent p-0 text-[11px] font-medium text-neutral-300 focus:outline-none">
              <option value="all">Tất cả cụm</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-hairline bg-raised/40 px-2.5 py-1 text-xs transition-colors duration-300 hover:border-hairline">
            <span className="font-medium text-neutral-500">Sản phẩm:</span>
            <select className="cursor-pointer border-0 bg-transparent p-0 text-[11px] font-medium text-neutral-300 focus:outline-none">
              <option value="all">Tất cả SP</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notifications & Account info */}
      <div className="flex shrink-0 items-center justify-end gap-3">
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-hairline bg-panel/80 text-neutral-400 transition-all duration-300 ease-in-out hover:text-neutral-100 active:scale-95"
          aria-label="Thông báo"
        >
          <UtilIcon name="bell" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent-rose shadow-[0_0_6px_rgba(244,63,94,0.9)]" />
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
      </div>
    </header>
  );
}
