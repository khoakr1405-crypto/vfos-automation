import { AcceptInviteForm } from './accept-form';

const KERNEL_URL = process.env.KERNEL_URL ?? 'http://localhost:3000';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ token: string }>;
}

interface InviteInfo {
  email: string | null;
  tenant_id: string | null;
  scopes: string[];
  is_admin: boolean;
  expires_at: string;
}

async function fetchInvite(token: string): Promise<
  | { ok: true; invite: InviteInfo }
  | { ok: false; status: number; error: string }
> {
  const res = await fetch(
    `${KERNEL_URL}/v1/auth/invite/${encodeURIComponent(token)}`,
    { cache: 'no-store' },
  );
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    invite?: InviteInfo;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.invite) {
    return { ok: false, status: res.status, error: data.error ?? 'unknown error' };
  }
  return { ok: true, invite: data.invite };
}

export default async function InviteAcceptPage({ params }: PageProps) {
  const { token } = await params;
  const result = await fetchInvite(token);
  if (!result.ok) {
    return (
      <div className="mx-auto max-w-sm py-16">
        <div className="rounded-lg border border-rose-700/60 bg-rose-900/20 p-4 text-sm text-rose-300">
          <div className="font-semibold">Invite unavailable</div>
          <div className="mt-1 text-xs text-rose-200/80">
            {result.error} (HTTP {result.status})
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-sm py-16">
      <AcceptInviteForm
        token={token}
        pinnedEmail={result.invite.email}
        isAdmin={result.invite.is_admin}
        scopes={result.invite.scopes}
      />
    </div>
  );
}
