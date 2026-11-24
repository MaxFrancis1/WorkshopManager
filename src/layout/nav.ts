import type { IconName } from './icons';

export interface NavEntry {
  path: string;
  label: string;
}

/** Desktop side nav, in the order shown in the designs. */
export const sideNav: NavEntry[] = [
  { path: '/', label: 'Dashboard' },
  { path: '/items', label: 'Items' },
  { path: '/stall', label: 'Stall' },
  { path: '/jobs', label: 'Jobs' },
  { path: '/purchases', label: 'Purchases' },
  { path: '/parts', label: 'Parts' },
  { path: '/services', label: 'Services' },
  { path: '/sales', label: 'Sales' },
  { path: '/overheads', label: 'Overheads' },
  { path: '/settings', label: 'Settings' },
];

/** Mobile bottom tabs. Everything else sits behind More. */
export const tabNav: (NavEntry & { icon: IconName })[] = [
  { path: '/', label: 'Dashboard', icon: 'dashboard' },
  { path: '/items', label: 'Items', icon: 'items' },
  { path: '/jobs', label: 'Jobs', icon: 'jobs' },
  { path: '/parts', label: 'Parts', icon: 'parts' },
  { path: '/more', label: 'More', icon: 'more' },
];

const tabPaths = new Set(tabNav.map((t) => t.path));

/** Sections reached from the More tab on mobile. */
export const moreNav: NavEntry[] = sideNav.filter((e) => !tabPaths.has(e.path));

/** The More tab stays highlighted while inside any of its sections. */
export function isMoreSection(pathname: string): boolean {
  return pathname === '/more' || moreNav.some((e) => pathname === e.path || pathname.startsWith(e.path + '/'));
}
