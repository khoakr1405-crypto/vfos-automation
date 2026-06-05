// Navigation model for the VFOS Studio shell.
// Sidebar is organized strictly by Operator business structure.
// Technical routes are accessed internally within Review Sản phẩm or direct URL.

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
  | 'schedule'
  | 'comments';

export type NavItem = {
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
    title: 'TRUNG TÂM ĐIỀU HÀNH',
    items: [{ no: 1, href: '/', label: 'Tổng quan', icon: 'overview', accent: 'blue' }],
  },
  {
    title: 'LANE NỘI DUNG',
    items: [
      {
        no: 2,
        href: '/lanes/product-review',
        label: 'Review Sản phẩm',
        icon: 'products',
        accent: 'amber',
      },
      {
        no: 3,
        href: '/lanes/fishing-vlog',
        label: 'Vlog Về Câu cá',
        icon: 'rawvisual',
        accent: 'cyan',
      },
      {
        no: 4,
        href: '/lanes/car-vlog',
        label: 'Vlog Về xe',
        icon: 'render',
        accent: 'violet',
      },
    ],
  },
  {
    title: 'VẬN HÀNH',
    items: [
      { no: 5, href: '/publish', label: 'Xuất bản & Lịch', icon: 'publish', accent: 'green' },
      { no: 6, href: '/channels', label: 'Cụm kênh & Kênh', icon: 'channels', accent: 'blue' },
      { no: 7, href: '/schedule', label: 'Lịch đa nền tảng', icon: 'schedule', accent: 'amber' },
    ],
  },
  {
    title: 'BÁO CÁO / TƯƠNG TÁC',
    items: [
      {
        no: 8,
        href: '/analytics',
        label: 'Hiệu suất / Analytics',
        icon: 'analytics',
        accent: 'green',
      },
      {
        no: 9,
        href: '/comments',
        label: 'Bình luận & Mắt thần',
        icon: 'comments',
        accent: 'violet',
      },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items).sort((a, b) => a.no - b.no);

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
