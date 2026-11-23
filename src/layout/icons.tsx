import type { ReactElement, SVGProps } from 'react';

const base: SVGProps<SVGSVGElement> = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export type IconName = 'dashboard' | 'items' | 'jobs' | 'parts' | 'more' | 'chevron';

export const icons: Record<IconName, ReactElement> = {
  dashboard: (
    <svg {...base}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  items: (
    <svg {...base}>
      <path d="M20 7l-8-4-8 4 8 4 8-4z" />
      <path d="M4 7v10l8 4 8-4V7" />
      <path d="M12 11v10" />
    </svg>
  ),
  jobs: (
    <svg {...base}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />
    </svg>
  ),
  parts: (
    <svg {...base}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  ),
  more: (
    <svg {...base}>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  ),
  chevron: (
    <svg {...base} width={18} height={18}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
};
