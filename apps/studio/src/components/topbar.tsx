import { SHOPEE_OWNER } from '@/lib/mock-data';
import { UtilIcon } from './icons';

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 flex flex-col border-b border-hairline bg-canvas/80 px-5 py-3 backdrop-blur lg:flex-row lg:items-center gap-4">
      {/* Search & Filters */}
      <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex w-full max-w-xs items-center gap-2 rounded-lg border border-hairline bg-panel/80 px-3 py-2 text-neutral-500 focus-within:border-neutral-500 transition">
          <UtilIcon name="search" />
          <input
            type="text"
            placeholder="Tìm sản phẩm, link, job, kênh…"
            className="w-full bg-transparent text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Time Filter */}
          <div className="flex items-center gap-1.5 bg-raised/40 border border-hairline rounded-lg px-2.5 py-1 text-xs">
            <span className="text-neutral-500 font-medium">Khoảng thời gian:</span>
            <select className="bg-transparent text-[11px] text-neutral-300 font-medium focus:outline-none cursor-pointer border-0 p-0">
              <option value="7d">7 ngày qua</option>
              <option value="30d">30 ngày qua</option>
              <option value="today">Hôm nay</option>
            </select>
          </div>

          {/* Cluster Filter */}
          <div className="flex items-center gap-1.5 bg-raised/40 border border-hairline rounded-lg px-2.5 py-1 text-xs">
            <span className="text-neutral-500 font-medium">Cụm kênh:</span>
            <select className="bg-transparent text-[11px] text-neutral-300 font-medium focus:outline-none cursor-pointer border-0 p-0">
              <option value="all">Tất cả cụm</option>
              <option value="review">Review Sản Phẩm</option>
              <option value="cau-ca">Câu Cá</option>
              <option value="rua-xe">Rửa Xe & Đồ Chơi Xe</option>
            </select>
          </div>

          {/* Platform Filter */}
          <div className="flex items-center gap-1.5 bg-raised/40 border border-hairline rounded-lg px-2.5 py-1 text-xs">
            <span className="text-neutral-500 font-medium">Nền tảng:</span>
            <select className="bg-transparent text-[11px] text-neutral-300 font-medium focus:outline-none cursor-pointer border-0 p-0">
              <option value="all">Tất cả mạng</option>
              <option value="facebook">Facebook Reels</option>
              <option value="tiktok">TikTok</option>
              <option value="youtube">YouTube Shorts</option>
            </select>
          </div>

          {/* Product Filter */}
          <div className="flex items-center gap-1.5 bg-raised/40 border border-hairline rounded-lg px-2.5 py-1 text-xs">
            <span className="text-neutral-500 font-medium">Sản phẩm:</span>
            <select className="bg-transparent text-[11px] text-neutral-300 font-medium focus:outline-none cursor-pointer border-0 p-0">
              <option value="all">Tất cả SP</option>
              <option value="P-1001">Zukul mini</option>
              <option value="P-1002">Cần câu Carbon</option>
              <option value="P-1003">Xay sinh tố mini</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notifications & Account info */}
      <div className="flex items-center justify-end gap-3 shrink-0">
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
      </div>
    </header>
  );
}
