// Iconos SVG inline del módulo de marcadores (sin librería de iconos).
interface IconProps { size?: number }

const base = (size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
})

export const IconLink = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
)

export const IconSearch = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)

export const IconStar = ({ size = 16, filled = false }: IconProps & { filled?: boolean }) => (
  <svg {...base(size)} fill={filled ? 'currentColor' : 'none'}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
)

export const IconCheckCircle = ({ size = 16, filled = false }: IconProps & { filled?: boolean }) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="10" fill={filled ? 'currentColor' : 'none'}/>
    <polyline points="8 12.5 11 15.5 16 9" stroke={filled ? 'var(--surface)' : 'currentColor'} strokeWidth="2"/>
  </svg>
)

export const IconCopy = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
)

export const IconCheck = ({ size = 16 }: IconProps) => (
  <svg {...base(size)} strokeWidth={2.5}>
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

export const IconEdit = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>
  </svg>
)

export const IconTrash = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
)

export const IconExternal = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/>
    <line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
)

export const IconRefresh = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
)

export const IconX = ({ size = 12 }: IconProps) => (
  <svg {...base(size)} strokeWidth={2.5}>
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

export const IconBookmarkPlaceholder = ({ size = 48 }: IconProps) => (
  <svg {...base(size)} strokeWidth={1.25}>
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
  </svg>
)
