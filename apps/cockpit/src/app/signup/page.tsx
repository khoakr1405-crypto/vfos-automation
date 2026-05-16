import { redirect } from 'next/navigation';
import { AuthForm } from '../login/login-form';
import { readSessionCookie } from '@/lib/session';

const KERNEL_URL = process.env.KERNEL_URL ?? 'http://localhost:3000';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SignupPage() {
  const existing = await readSessionCookie();
  if (existing) redirect('/');
  // If a user already exists, signup is closed — bounce to /login.
  // redirect() throws NEXT_REDIRECT, so the check must live *outside* any
  // try/catch that would swallow it.
  let signupAllowed = true;
  try {
    const res = await fetch(`${KERNEL_URL}/v1/auth/bootstrap-status`, { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as { signup_allowed?: boolean };
      signupAllowed = data.signup_allowed !== false;
    }
  } catch {
    // kernel unreachable — let user attempt signup and see error
  }
  if (!signupAllowed) redirect('/login');
  return (
    <div className="py-16">
      <div className="mb-4 text-center text-xs text-neutral-500">
        Bootstrap mode: the first signup becomes the platform admin.
      </div>
      <AuthForm mode="signup" />
    </div>
  );
}
