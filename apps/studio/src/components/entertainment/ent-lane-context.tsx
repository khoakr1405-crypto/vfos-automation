'use client';

/* =============================================================================
 * VFOS Studio — Entertainment lane shared context (multi-channel R2)
 * -----------------------------------------------------------------------------
 * 1 nguồn state dùng chung cho cả lane: danh sách KÊNH + kênh đang chọn
 * (selectedChannelId) + job (LỌC theo kênh) + job đang chọn. Giúp Operator quản
 * nhiều account TikTok mà không lẫn: chọn kênh → chỉ thấy job của kênh đó.
 * UI-ONLY: chỉ fetch route đọc-only R1/R2; KHÔNG token, KHÔNG OAuth/refresh.
 * ========================================================================== */

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export interface EntJobLite {
  jobId: string;
  state: string;
  source?: { url?: string; durationSec?: number };
  channelId?: string | null;
  channelName?: string | null;
  tiktokUsername?: string | null;
}

export interface EntChannelLite {
  channelId: string;
  channelName: string;
  niche: string;
  tiktokUsername: string;
  tiktokDisplayName: string | null;
  status: 'active' | 'inactive';
  avatar: string | null;
  accountConfigured: boolean;
  jobCount: number;
  postedToday: number;
  /** Kênh nguồn TQ đã gắn? (badge + bật flow auto-list khi "Tải link"). */
  hasSourceChannel: boolean;
  sourcePlatform: 'douyin' | 'tiktok' | null;
  sourceLabel: string | null;
  /** Engine montage mặc định của kênh (read-only chip). Thiếu → 'story'. */
  storyEngine?: 'story' | 'anchors';
}

interface EntLaneCtx {
  channels: EntChannelLite[];
  selectedChannelId: string;
  selectChannel: (id: string) => void;
  selectedChannel: EntChannelLite | null;
  refreshChannels: () => Promise<void>;
  /** Job ĐÃ LỌC theo kênh đang chọn (rỗng channel = tất cả). */
  jobs: EntJobLite[];
  allJobs: EntJobLite[];
  selectedId: string;
  selectJob: (id: string) => void;
  refreshJobs: () => Promise<void>;
}

const Ctx = createContext<EntLaneCtx | null>(null);

export function useEntLane(): EntLaneCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useEntLane must be used inside <EntLaneProvider>');
  return v;
}

export function EntLaneProvider({ children }: { children: ReactNode }) {
  const [channels, setChannels] = useState<EntChannelLite[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [allJobs, setAllJobs] = useState<EntJobLite[]>([]);
  const [selectedId, setSelectedId] = useState('');

  const refreshChannels = useCallback(async () => {
    try {
      const r = await fetch('/api/studio/entertainment/channels');
      const j = (await r.json()) as { ok: boolean; channels?: EntChannelLite[] };
      if (j.ok && j.channels) {
        setChannels(j.channels);
        // Lần đầu: tự chọn kênh active đầu tiên cho dễ dùng (vẫn có "Tất cả").
        setSelectedChannelId(
          (cur) => cur || j.channels?.find((c) => c.status === 'active')?.channelId || '',
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    try {
      const r = await fetch('/api/studio/entertainment/jobs');
      const j = (await r.json()) as { ok: boolean; jobs?: EntJobLite[] };
      if (j.ok && j.jobs) setAllJobs(j.jobs);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshChannels();
    void refreshJobs();
  }, [refreshChannels, refreshJobs]);

  const jobs = useMemo(
    () => (selectedChannelId ? allJobs.filter((j) => j.channelId === selectedChannelId) : allJobs),
    [allJobs, selectedChannelId],
  );

  // Giữ job đang chọn hợp lệ trong tập đã lọc (đổi kênh → nhảy về job đầu của kênh).
  useEffect(() => {
    if (jobs.length === 0) {
      if (selectedId) setSelectedId('');
      return;
    }
    if (!jobs.some((j) => j.jobId === selectedId)) setSelectedId(jobs[0]?.jobId ?? '');
  }, [jobs, selectedId]);

  const selectJob = useCallback((id: string) => setSelectedId(id), []);
  const selectChannel = useCallback((id: string) => setSelectedChannelId(id), []);
  const selectedChannel = useMemo(
    () => channels.find((c) => c.channelId === selectedChannelId) ?? null,
    [channels, selectedChannelId],
  );

  return (
    <Ctx.Provider
      value={{
        channels,
        selectedChannelId,
        selectChannel,
        selectedChannel,
        refreshChannels,
        jobs,
        allJobs,
        selectedId,
        selectJob,
        refreshJobs,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

/** 1 ô chọn job dùng chung (đã lọc theo kênh) — kèm badge kênh để khỏi lẫn account. */
export function EntJobSelector() {
  const { jobs, selectedId, selectJob, selectedChannel } = useEntLane();
  const cur = jobs.find((j) => j.jobId === selectedId);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold text-neutral-400">Job đang chọn:</span>
      <select
        value={selectedId}
        onChange={(e) => selectJob(e.target.value)}
        className="rounded-lg border border-hairline/60 bg-panel/40 px-2 py-1.5 text-xs text-neutral-200 focus:border-accent-cyan/50 focus:outline-none"
      >
        {jobs.length === 0 && (
          <option value="">
            {selectedChannel
              ? `— chưa có job ở ${selectedChannel.channelName} —`
              : '— chưa có job —'}
          </option>
        )}
        {jobs.map((j) => (
          <option key={j.jobId} value={j.jobId}>
            {j.jobId} · {j.state}
          </option>
        ))}
      </select>
      {cur?.tiktokUsername && (
        <span className="rounded-full border border-accent-cyan/30 bg-accent-cyan/10 px-2 py-0.5 text-[10px] font-semibold text-accent-cyan">
          @{cur.tiktokUsername}
        </span>
      )}
      {cur && (
        <span className="rounded-full bg-panel/60 px-2 py-0.5 text-[10px] font-semibold text-neutral-300">
          {cur.state}
        </span>
      )}
    </div>
  );
}
