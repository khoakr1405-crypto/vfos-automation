import type { IconKey } from '@/lib/nav';
import type { ReactElement, SVGProps } from 'react';

// Minimal inline stroke-icon set (no icon dependency added in this round).
// Each entry is the inner markup of a 24x24 viewBox using `currentColor`.
type Paths = ReactElement;

const NAV_ICONS: Record<IconKey, Paths> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  channels: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M7.7 7.7 11 15M16.3 7.7 13 15" />
    </>
  ),
  products: (
    <>
      <path d="M3 8 12 3l9 5-9 5-9-5Z" />
      <path d="M3 8v8l9 5 9-5V8" />
    </>
  ),
  create: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  rawvisual: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m10 9 5 3-5 3V9Z" />
    </>
  ),
  script: (
    <>
      <path d="M5 4h10l4 4v12H5z" />
      <path d="M9 12h6M9 16h4M14 4v4h4" />
    </>
  ),
  render: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  qa: (
    <>
      <path d="M12 3 5 6v5c0 4 3 7 7 9 4-2 7-5 7-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  publish: (
    <>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </>
  ),
  analytics: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  schedule: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </>
  ),
  comments: (
    <>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </>
  ),
};

const UTIL_ICONS = {
  search: <path d="m21 21-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z" />,
  bell: <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10.5 21a1.5 1.5 0 0 0 3 0" />,
  link: (
    <>
      <path d="M9 15 15 9" />
      <path d="M11 7l1-1a4 4 0 0 1 6 6l-1 1M13 17l-1 1a4 4 0 0 1-6-6l1-1" />
    </>
  ),
  play: <path d="m8 5 11 7-11 7V5Z" />,
  download: <path d="M12 3v12M7 11l5 5 5-5M5 21h14" />,
  check: <path d="m5 13 4 4L19 7" />,
  x: <path d="M6 6 18 18M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  filter: <path d="M3 5h18l-7 8v6l-4-2v-4z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
  sparkle: <path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" />,
} as const;

export type UtilIconKey = keyof typeof UTIL_ICONS;

type IconProps = SVGProps<SVGSVGElement> & { name: IconKey };
type UtilProps = SVGProps<SVGSVGElement> & { name: UtilIconKey };

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function Icon({ name, width = 18, height = 18, ...rest }: IconProps) {
  return (
    <svg {...base} width={width} height={height} aria-hidden {...rest}>
      <title>{name}</title>
      {NAV_ICONS[name]}
    </svg>
  );
}

export function UtilIcon({ name, width = 16, height = 16, ...rest }: UtilProps) {
  return (
    <svg {...base} width={width} height={height} aria-hidden {...rest}>
      <title>{name}</title>
      {UTIL_ICONS[name]}
    </svg>
  );
}
