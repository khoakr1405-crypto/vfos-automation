export function OfflineBanner({ error }: { error: unknown }) {
  return (
    <div className="rounded-lg border border-rose-700/60 bg-rose-900/20 p-4 text-sm">
      <div className="font-semibold text-rose-300">Kernel offline</div>
      <div className="mt-1 text-neutral-300">
        Cockpit cannot reach the kernel at <code className="font-mono">/api/kernel/*</code>.
      </div>
      <div className="mt-2 text-xs text-neutral-500">
        Start it with <code className="font-mono">pnpm --filter @vfos/kernel dev</code>.
      </div>
      <div className="mt-2 truncate font-mono text-xs text-neutral-600">
        {error instanceof Error ? error.message : String(error)}
      </div>
    </div>
  );
}
