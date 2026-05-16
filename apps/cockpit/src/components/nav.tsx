import Link from 'next/link';
import { readSessionCookie } from '@/lib/session';

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/scheduler', label: 'Scheduler' },
  { href: '/webhooks', label: 'Webhooks' },
  { href: '/tenants', label: 'Tenants' },
  { href: '/tokens', label: 'Tokens' },
  { href: '/keys', label: 'API keys' },
  { href: '/costs', label: 'Costs' },
  { href: '/invites', label: 'Invites' },
  { href: '/plugins', label: 'Plugins' },
  { href: '/plugins/marketplace', label: 'Marketplace' },
  { href: '/connectors', label: 'Connectors' },
  { href: '/ai-lab', label: 'AI Lab' },
  { href: '/syscalls', label: 'Syscalls' },
  { href: '/events', label: 'Events' },
  { href: '/audit', label: 'Audit' },
  { href: '/metrics', label: 'Metrics' },
  { href: '/traces', label: 'Traces' },
];

export async function Nav() {
  const session = await readSessionCookie();
  return (
    <nav className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-4">
        <span className="font-mono text-sm font-bold tracking-wider text-emerald-400">
          VFOS<span className="text-neutral-500"> / cockpit</span>
        </span>
        <div className="flex flex-1 gap-5 text-sm">
          {session &&
            links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-neutral-300 transition hover:text-white"
              >
                {l.label}
              </Link>
            ))}
        </div>
        <div className="text-xs">
          {session ? (
            <form action="/logout" method="POST" className="inline">
              <button type="submit" className="text-neutral-400 transition hover:text-rose-300">
                Sign out
              </button>
            </form>
          ) : (
            <Link href="/login" className="text-neutral-400 transition hover:text-emerald-300">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
