import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'outline' | 'danger' | 'success';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent-blue/90 text-white hover:bg-accent-blue',
  success: 'bg-accent-green/90 text-white hover:bg-accent-green',
  danger: 'bg-accent-rose/90 text-white hover:bg-accent-rose',
  outline: 'border border-hairline bg-raised/40 text-neutral-200 hover:bg-raised',
  ghost: 'text-neutral-300 hover:bg-raised/60 hover:text-neutral-100',
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

/**
 * Presentational only — these buttons do NOT trigger publishing, API calls, or
 * pipeline runs in this round. They are shell affordances.
 */
export function Button({ variant = 'outline', className = '', children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function RuleList({ rules }: { rules: string[] }) {
  return (
    <ul className="space-y-2 text-xs text-neutral-300">
      {rules.map((r) => (
        <li key={r} className="flex items-start gap-2">
          <span className="mt-0.5 text-accent-green">●</span>
          <span>{r}</span>
        </li>
      ))}
    </ul>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  // Presentational field wrapper — children are mock selects/textareas, so this
  // is a plain block (not a <label>) to avoid an empty label-control binding.
  return (
    <div className="block">
      <span className="mb-1.5 block text-[11px] font-medium text-neutral-400">{label}</span>
      {children}
    </div>
  );
}

export function FakeSelect({ value }: { value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-hairline bg-panel/80 px-3 py-2 text-xs text-neutral-200">
      <span>{value}</span>
      <span className="text-neutral-600">▾</span>
    </div>
  );
}
