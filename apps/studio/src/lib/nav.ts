// Navigation model for the VFOS Studio shell.
// Each of the 11 modules from the UI reference is its OWN route/page — the
// overview ("/") only aggregates; deep work lives on dedicated pages.

export type AccentKey = 'blue' | 'violet' | 'green' | 'amber' | 'cyan' | 'rose';
export type IconKey =
  | 'overview'
  | 'channels'
  | 'products'
  | 'create'
  | 'rawvisual'
  | 'script'
  | 'render'
  | 'qa'
  | 'publish'
  | 'analytics'
  | 'schedule';

export type NavItem = {
  /** Module number as shown in the reference (1..11). */
  no: number;
  href: string;
  label: string;
  icon: IconKey;
  accent: AccentKey;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Tổng quan',
    items: [{ no: 1, href: '/', label: 'Tổng quan', icon: 'overview', accent: 'blue' }],
  },
  {
    title: 'Nội dung',
    items: [
      { no: 4, href: '/create', label: 'Tạo nội dung mới', icon: 'create', accent: 'violet' },
      { no: 5, href: '/raw-visual', label: 'Raw Visual AI', icon: 'rawvisual', accent: 'violet' },
      { no: 6, href: '/script', label: 'Script / Voice / BGM', icon: 'script', accent: 'violet' },
      { no: 7, href: '/render', label: 'Render & Caption', icon: 'render', accent: 'cyan' },
    ],
  },
  {
    title: 'Kênh & Sản phẩm',
    items: [
      { no: 2, href: '/channels', label: 'Cụm kênh & Kênh', icon: 'channels', accent: 'blue' },
      { no: 3, href: '/products', label: 'Sản phẩm & Link', icon: 'products', accent: 'amber' },
    ],
  },
  {
    title: 'Vận hành',
    items: [
      { no: 8, href: '/qa', label: 'QA & Duyệt', icon: 'qa', accent: 'green' },
      { no: 9, href: '/publish', label: 'Xuất bản & Lịch', icon: 'publish', accent: 'green' },
      { no: 11, href: '/schedule', label: 'Lịch đa nền tảng', icon: 'schedule', accent: 'amber' },
    ],
  },
  {
    title: 'Đo lường',
    items: [
      {
        no: 10,
        href: '/analytics',
        label: 'Hiệu suất / Analytics',
        icon: 'analytics',
        accent: 'green',
      },
    ],
  },
];

/** Flat list, ordered by module number — handy for breadcrumbs / lookups. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items).sort((a, b) => a.no - b.no);

// Tailwind needs literal class strings at build time, so accent -> classes is a
// static lookup rather than interpolated `text-accent-${x}`.
export const ACCENT_TEXT: Record<AccentKey, string> = {
  blue: 'text-accent-blue',
  violet: 'text-accent-violet',
  green: 'text-accent-green',
  amber: 'text-accent-amber',
  cyan: 'text-accent-cyan',
  rose: 'text-accent-rose',
};

export const ACCENT_BG_SOFT: Record<AccentKey, string> = {
  blue: 'bg-accent-blue/15 text-accent-blue',
  violet: 'bg-accent-violet/15 text-accent-violet',
  green: 'bg-accent-green/15 text-accent-green',
  amber: 'bg-accent-amber/15 text-accent-amber',
  cyan: 'bg-accent-cyan/15 text-accent-cyan',
  rose: 'bg-accent-rose/15 text-accent-rose',
};

export const ACCENT_RING: Record<AccentKey, string> = {
  blue: 'ring-accent-blue/40',
  violet: 'ring-accent-violet/40',
  green: 'ring-accent-green/40',
  amber: 'ring-accent-amber/40',
  cyan: 'ring-accent-cyan/40',
  rose: 'ring-accent-rose/40',
};
