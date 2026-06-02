import type { ReactNode } from 'react';

type CardProps = {
  children: ReactNode;
  className?: string;
};

/** Rounded dark panel — the base surface for every module section. */
export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-hairline bg-card/80 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset] ${className}`}
    >
      {children}
    </div>
  );
}

type CardHeaderProps = {
  title: string;
  subtitle?: string;
  /** Optional module number chip (1..11) to echo the reference layout. */
  no?: number;
  right?: ReactNode;
  accentClass?: string;
};

export function CardHeader({
  title,
  subtitle,
  no,
  right,
  accentClass = 'text-accent-blue',
}: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
      <div className="flex items-center gap-3">
        {typeof no === 'number' && (
          <span className={`w-1 h-3.5 rounded-full bg-current shrink-0 ${accentClass}`} />
        )}
        <div>
          <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function CardBody({ children, className = '' }: CardProps) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}
