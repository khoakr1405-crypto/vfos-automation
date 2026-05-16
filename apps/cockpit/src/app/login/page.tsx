import { redirect } from 'next/navigation';
import { AuthForm } from './login-form';
import { readSessionCookie } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function LoginPage() {
  const existing = await readSessionCookie();
  if (existing) redirect('/');
  return (
    <div className="py-16">
      <AuthForm mode="login" />
    </div>
  );
}
