'use client';

import { useActionState } from 'react';
import { loginAction, signupAction, type AuthFormState } from './actions';

const INITIAL: AuthFormState = { status: 'idle' };

interface Props {
  mode: 'login' | 'signup';
}

export function AuthForm({ mode }: Props) {
  const action = mode === 'login' ? loginAction : signupAction;
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const label = mode === 'login' ? 'Sign in' : 'Create admin account';
  const altHref = mode === 'login' ? '/signup' : '/login';
  const altLabel = mode === 'login' ? 'Need to create the first account?' : 'Already have an account?';

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <form
        action={formAction}
        className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-6"
      >
        <h1 className="text-lg font-semibold text-neutral-100">{label}</h1>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-sm text-neutral-200 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">password</span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-sm text-neutral-200 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {pending ? 'Working…' : label}
        </button>

        {state.status === 'error' && (
          <div className="rounded border border-rose-700/60 bg-rose-900/20 p-2 text-sm text-rose-300">
            {state.message}
          </div>
        )}
      </form>
      <a href={altHref} className="block text-center text-xs text-neutral-400 hover:text-neutral-200">
        {altLabel}
      </a>
    </div>
  );
}
