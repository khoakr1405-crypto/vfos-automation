'use client';

/* =============================================================================
 * VFOS Studio — Entertainment Channel Switcher + Overview (multi-channel R2)
 * -----------------------------------------------------------------------------
 * UI-ONLY hiển thị + chọn kênh active. Switcher (header) + Overview cards. Đọc
 * từ /api/studio/entertainment/channels (no token). KHÔNG OAuth/refresh/lịch đăng
 * (R3/R4). Kênh chưa có token vẫn hiện với trạng thái "chưa cấu hình".
 * ========================================================================== */

import type { EntChannelLite } from './ent-lane-context';
import { useEntLane } from './ent-lane-context';

function nicheEmoji(niche: string): string {
  if (/fish|câu|cau/i.test(niche)) return '🎣';
  if (/car|xe/i.test(niche)) return '🚗';
  if (/life|meo|mẹo|đời/i.test(niche)) return '💡';
  return '🎬';
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${active ? 'bg-accent-green' : 'bg-neutral-600'}`}
    />
  );
}

/** Switcher gọn cho header — chọn kênh active (hoặc "Tất cả kênh"). */
export function ChannelSwitcher() {
  const { channels, selectedChannelId, selectChannel, selectedChannel } = useEntLane();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold text-neutral-400">Kênh:</span>
      <select
        value={selectedChannelId}
        onChange={(e) => selectChannel(e.target.value)}
        className="rounded-lg border border-accent-cyan/40 bg-accent-cyan/10 px-3 py-1.5 text-xs font-semibold text-accent-cyan focus:outline-none"
      >
        <option value="">Tất cả kênh</option>
        {channels.map((c) => (
          <option key={c.channelId} value={c.channelId} disabled={c.status !== 'active'}>
            {nicheEmoji(c.niche)} {c.channelName}
            {c.tiktokUsername ? ` (@${c.tiktokUsername})` : ''}
            {c.status !== 'active' ? ' · tắt' : ''}
          </option>
        ))}
      </select>
      {selectedChannel ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-panel/60 px-2 py-0.5 text-[10px] font-semibold text-neutral-300">
          <StatusDot active={selectedChannel.status === 'active'} />@{selectedChannel.tiktokUsername}
        </span>
      ) : (
        <span className="rounded-full bg-accent-amber/15 px-2 py-0.5 text-[10px] font-semibold text-accent-amber">
          ⚠ chọn 1 kênh để tạo job mới
        </span>
      )}
    </div>
  );
}

function ChannelCard({ c, active, onClick }: { c: EntChannelLite; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-2 rounded-xl border p-3 text-left transition ${
        active
          ? 'border-accent-cyan/50 bg-accent-cyan/10'
          : 'border-hairline/50 bg-panel/30 hover:border-accent-cyan/30 hover:bg-panel/50'
      } ${c.status !== 'active' ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-panel/60 text-lg">
          {c.avatar ? '' : nicheEmoji(c.niche)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-neutral-100">
            {active && <span className="text-accent-cyan">● </span>}
            {c.channelName}
          </p>
          <p className="truncate text-[10px] text-neutral-500">
            {c.tiktokUsername ? `@${c.tiktokUsername}` : 'chưa gắn TikTok'} · {c.niche}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className="inline-flex items-center gap-1 rounded bg-panel/60 px-1.5 py-0.5 text-neutral-400">
          <StatusDot active={c.status === 'active'} />
          {c.status === 'active' ? 'active' : 'tắt'}
        </span>
        <span className="rounded bg-panel/60 px-1.5 py-0.5 text-neutral-400">{c.jobCount} job</span>
        <span
          className={`rounded px-1.5 py-0.5 ${
            c.postedToday > 0
              ? 'bg-accent-green/15 text-accent-green'
              : 'bg-panel/60 text-neutral-500'
          }`}
        >
          {c.postedToday > 0 ? `hôm nay: đăng ${c.postedToday}` : 'hôm nay: chưa đăng'}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 ${
            c.accountConfigured
              ? 'bg-accent-green/15 text-accent-green'
              : 'bg-accent-amber/15 text-accent-amber'
          }`}
        >
          {c.accountConfigured ? '🔑 token sẵn sàng' : '⚠ chưa có token'}
        </span>
      </div>
    </button>
  );
}

/** Overview cards — bấm card để lọc lane theo kênh đó. Bao gồm thẻ "Tất cả kênh". */
export function ChannelOverview() {
  const { channels, selectedChannelId, selectChannel } = useEntLane();
  if (channels.length === 0) {
    return (
      <p className="text-[11px] text-neutral-600">
        Chưa có kênh trong registry (config/entertainment_channels.json).
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <button
        type="button"
        onClick={() => selectChannel('')}
        className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-3 text-center transition ${
          selectedChannelId === ''
            ? 'border-accent-cyan/50 bg-accent-cyan/10'
            : 'border-hairline/50 bg-panel/30 hover:bg-panel/50'
        }`}
      >
        <span className="text-lg">🗂️</span>
        <span className="text-xs font-bold text-neutral-200">Tất cả kênh</span>
        <span className="text-[10px] text-neutral-500">{channels.length} kênh</span>
      </button>
      {channels.map((c) => (
        <ChannelCard
          key={c.channelId}
          c={c}
          active={c.channelId === selectedChannelId}
          onClick={() => selectChannel(c.channelId)}
        />
      ))}
    </div>
  );
}
