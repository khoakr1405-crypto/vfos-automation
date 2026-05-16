'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { replayEventAction } from '@/app/events/actions';
import { getEvents, type KernelEvent } from '@/lib/kernel';

const SCHEMA_COLOR: Record<string, string> = {
  'trend.discovered.v1': 'text-emerald-300',
  'affiliate.matched.v1': 'text-amber-300',
  'niche.classified.v1': 'text-sky-300',
  'compliance.decision.v1': 'text-violet-300',
  'render.completed.v1': 'text-cyan-300',
};

const POLL_MS = 1500;

export function LiveEventsFeed({ initial }: { initial: KernelEvent[] }) {
  const [events, setEvents] = useState<KernelEvent[]>(initial);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [pendingReplayId, setPendingReplayId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const lastIdRef = useRef<string | null>(initial[0]?.event_id ?? null);

  const handleReplay = (event_id: string): void => {
    setPendingReplayId(event_id);
    const fd = new FormData();
    fd.set('event_id', event_id);
    startTransition(async () => {
      try {
        await replayEventAction(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setPendingReplayId(null);
      }
    });
  };

  useEffect(() => {
    if (paused) return;
    const tick = async (): Promise<void> => {
      try {
        const res = await getEvents({ limit: 100 });
        setError(null);
        if (res.events.length === 0) return;
        const newest = res.events[0]?.event_id ?? null;
        if (newest && newest !== lastIdRef.current) {
          lastIdRef.current = newest;
          setEvents(res.events);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [paused]);

  const filtered = filter ? events.filter((e) => e.schema.includes(filter)) : events;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter by schema (e.g. compliance)"
          className="flex-1 rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 font-mono text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className={`rounded px-3 py-1.5 text-xs font-medium transition ${
            paused
              ? 'bg-amber-700/40 text-amber-200 hover:bg-amber-700/60'
              : 'bg-emerald-700/30 text-emerald-200 hover:bg-emerald-700/50'
          }`}
        >
          {paused ? '▶ resume' : '⏸ pause'}
        </button>
        <span className="font-mono text-xs text-neutral-500">
          {filtered.length} / {events.length}
        </span>
      </div>

      {error && (
        <div className="rounded border border-rose-700/60 bg-rose-900/20 px-3 py-2 font-mono text-xs text-rose-300">
          poll error: {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-neutral-800">
        <ul className="divide-y divide-neutral-800/60 font-mono text-xs">
          {filtered.map((e) => {
            const isReplay = e.meta?.replay === true;
            return (
              <li key={e.event_id} className="px-4 py-2">
                <div className="grid grid-cols-12 items-center gap-3">
                  <span className="col-span-2 text-neutral-500">
                    {e.emitted_at.slice(11, 23)}
                    {isReplay && (
                      <span className="ml-1 rounded bg-amber-700/40 px-1 py-0.5 text-[9px] uppercase text-amber-200">
                        replay
                      </span>
                    )}
                  </span>
                  <span
                    className={`col-span-3 truncate ${
                      SCHEMA_COLOR[e.schema] ?? 'text-neutral-300'
                    }`}
                  >
                    {e.schema}
                  </span>
                  <span className="col-span-3 truncate text-neutral-400">{e.emitter}</span>
                  <span className="col-span-3 truncate text-neutral-600">
                    {JSON.stringify(e.payload)}
                  </span>
                  <span className="col-span-1 text-right">
                    <button
                      type="button"
                      onClick={() => handleReplay(e.event_id)}
                      disabled={pendingReplayId === e.event_id}
                      className="rounded bg-sky-700/50 px-2 py-0.5 text-[10px] uppercase text-sky-100 transition hover:bg-sky-600 disabled:opacity-40"
                    >
                      {pendingReplayId === e.event_id ? '…' : 'replay'}
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-neutral-500">no events match filter</li>
          )}
        </ul>
      </div>
    </div>
  );
}
