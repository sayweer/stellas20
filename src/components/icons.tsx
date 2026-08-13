/** Minimal hand-rolled SVG icons (lucide-style strokes) — avoids an icon dependency. */
import type { ReactElement, ReactNode } from 'react'

interface IconProps {
  className?: string
}

function Icon({
  className = 'h-4 w-4',
  children,
}: IconProps & { children: ReactNode }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/*
 * A concept icon carries a second layer: the solid mass of the object it draws,
 * filled at a low alpha under the outline. One colour, two flat fields — the
 * same way the brand spends its gradient as sampled steps rather than a wash,
 * so this stays inside `brand.md`'s rule against decorative gradients.
 *
 * The mass is what makes a lock read as a lock at 20px instead of as four
 * strokes, and it is the surface the figure tone actually shows on: a hairline
 * outline alone gives a colour almost no area to be seen in.
 *
 * The stroke is lighter than the UI icons' 2. These render at 20–24px where a
 * 2px stroke closes up the counters; the small chrome icons render at 14–16px
 * where it does not.
 */
function FigureIcon({
  className = 'h-5 w-5',
  mass,
  children,
}: IconProps & { mass: ReactNode; children: ReactNode }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <g fill="currentColor" stroke="none" opacity={0.22}>
        {mass}
      </g>
      {children}
    </svg>
  )
}

export function CopyIcon({ className }: IconProps): ReactElement {
  return (
    <Icon className={className}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </Icon>
  )
}

export function CheckIcon({ className }: IconProps): ReactElement {
  return (
    <Icon className={className}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  )
}

export function RefreshIcon({ className }: IconProps): ReactElement {
  return (
    <Icon className={className}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </Icon>
  )
}

export function ExternalLinkIcon({ className }: IconProps): ReactElement {
  return (
    <Icon className={className}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </Icon>
  )
}

export function AlertTriangleIcon({ className }: IconProps): ReactElement {
  return (
    <Icon className={className}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Icon>
  )
}

export function CheckCircleIcon({ className }: IconProps): ReactElement {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  )
}

export function XCircleIcon({ className }: IconProps): ReactElement {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </Icon>
  )
}

export function InfoIcon({ className }: IconProps): ReactElement {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </Icon>
  )
}

export function XIcon({ className }: IconProps): ReactElement {
  return (
    <Icon className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  )
}

export function WalletIcon({ className }: IconProps): ReactElement {
  return (
    <FigureIcon
      className={className}
      mass={<rect x="2.75" y="5.75" width="18.5" height="14.5" rx="2.75" />}
    >
      <rect x="2.75" y="5.75" width="18.5" height="14.5" rx="2.75" />
      <path d="M16.5 11.75h4.75v4.5H16.5a2.25 2.25 0 0 1 0-4.5Z" />
    </FigureIcon>
  )
}

export function DropletIcon({ className }: IconProps): ReactElement {
  return (
    <FigureIcon
      className={className}
      mass={
        <path d="M12 21.25c3.45 0 6.25-2.72 6.25-6.08 0-3.6-3.2-6.42-6.25-11.42-3.05 5-6.25 7.82-6.25 11.42 0 3.36 2.8 6.08 6.25 6.08Z" />
      }
    >
      <path d="M12 21.25c3.45 0 6.25-2.72 6.25-6.08 0-3.6-3.2-6.42-6.25-11.42-3.05 5-6.25 7.82-6.25 11.42 0 3.36 2.8 6.08 6.25 6.08Z" />
      <path d="M9.25 15.4a2.85 2.85 0 0 0 2.35 2.7" />
    </FigureIcon>
  )
}

export function LayersIcon({ className }: IconProps): ReactElement {
  return (
    <FigureIcon className={className} mass={<path d="M12 2.5 21.25 7 12 11.5 2.75 7Z" />}>
      <path d="M12 2.5 21.25 7 12 11.5 2.75 7Z" />
      <path d="m2.75 12 9.25 4.5 9.25-4.5" />
      <path d="m2.75 16.75 9.25 4.5 9.25-4.5" />
    </FigureIcon>
  )
}

/*
 * Not lucide's branch glyph, which reads as a merge as readily as a split. One
 * stream arrives and two leave it — the shape of the only thing this protocol
 * does to a position.
 */
export function SplitIcon({ className }: IconProps): ReactElement {
  return (
    <FigureIcon
      className={className}
      mass={
        <>
          <circle cx="17.75" cy="7.5" r="3.25" />
          <circle cx="17.75" cy="16.5" r="3.25" />
        </>
      }
    >
      <path d="M2.75 12H6.5l3.75-4.5h4.25" />
      <path d="m6.5 12 3.75 4.5h4.25" />
      <circle cx="17.75" cy="7.5" r="3.25" />
      <circle cx="17.75" cy="16.5" r="3.25" />
    </FigureIcon>
  )
}

export function CoinsIcon({ className }: IconProps): ReactElement {
  return (
    <FigureIcon
      className={className}
      mass={
        <>
          <circle cx="9" cy="8.75" r="5.75" />
          <circle cx="15.25" cy="15.25" r="5.75" />
        </>
      }
    >
      <circle cx="9" cy="8.75" r="5.75" />
      <circle cx="15.25" cy="15.25" r="5.75" />
      <path d="M9 6.5v2.25h1.75" />
    </FigureIcon>
  )
}

export function ClockIcon({ className }: IconProps): ReactElement {
  return (
    <FigureIcon className={className} mass={<circle cx="12" cy="12" r="8.75" />}>
      <circle cx="12" cy="12" r="8.75" />
      <path d="M12 6.75V12l3.5 2" />
    </FigureIcon>
  )
}

export function SunIcon({ className }: IconProps): ReactElement {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.42 1.42" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </Icon>
  )
}

export function MoonIcon({ className }: IconProps): ReactElement {
  return (
    <Icon className={className}>
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z" />
    </Icon>
  )
}

export function Spinner({ className = 'h-4 w-4' }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`animate-spin ${className}`} aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function LockIcon({ className }: IconProps): ReactElement {
  return (
    <FigureIcon
      className={className}
      mass={<rect x="3.25" y="10.75" width="17.5" height="10.25" rx="2.5" />}
    >
      <rect x="3.25" y="10.75" width="17.5" height="10.25" rx="2.5" />
      <path d="M7.75 10.75V7.5a4.25 4.25 0 0 1 8.5 0v3.25" />
      <path d="M12 14.75v2.5" />
    </FigureIcon>
  )
}

/* The mass here is the track each arrow travels, not the arrow — a stroke-only
   glyph gives the figure tone no area to be read in. */
export function SwapIcon({ className }: IconProps): ReactElement {
  return (
    <FigureIcon
      className={className}
      mass={
        <>
          <rect x="3.5" y="6.75" width="16" height="2.5" rx="1.25" />
          <rect x="4.5" y="14.75" width="16" height="2.5" rx="1.25" />
        </>
      }
    >
      <path d="M8 3.75 3.75 8l4.25 4.25" />
      <path d="M3.75 8h15.75" />
      <path d="m16 11.75 4.25 4.25L16 20.25" />
      <path d="M20.25 16H4.5" />
    </FigureIcon>
  )
}

export function ChartBarIcon({ className }: IconProps): ReactElement {
  return (
    <FigureIcon
      className={className}
      mass={
        <>
          <rect x="6.5" y="13" width="3.5" height="6.25" rx="1" />
          <rect x="11.75" y="9.5" width="3.5" height="9.75" rx="1" />
          <rect x="17" y="6" width="3.5" height="13.25" rx="1" />
        </>
      }
    >
      <path d="M3.5 3.25v14.75a1.25 1.25 0 0 0 1.25 1.25H20.75" />
      <rect x="6.5" y="13" width="3.5" height="6.25" rx="1" />
      <rect x="11.75" y="9.5" width="3.5" height="9.75" rx="1" />
      <rect x="17" y="6" width="3.5" height="13.25" rx="1" />
    </FigureIcon>
  )
}

export function SlidersIcon({ className }: IconProps): ReactElement {
  return (
    <Icon className={className}>
      <line x1="4" x2="4" y1="21" y2="14" />
      <line x1="4" x2="4" y1="10" y2="3" />
      <line x1="12" x2="12" y1="21" y2="12" />
      <line x1="12" x2="12" y1="8" y2="3" />
      <line x1="20" x2="20" y1="21" y2="16" />
      <line x1="20" x2="20" y1="12" y2="3" />
      <line x1="1" x2="7" y1="14" y2="14" />
      <line x1="9" x2="15" y1="8" y2="8" />
      <line x1="17" x2="23" y1="16" y2="16" />
    </Icon>
  )
}

export function ArrowRightIcon({ className }: IconProps): ReactElement {
  return (
    <Icon className={className}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </Icon>
  )
}

export function ChevronDownIcon({ className }: IconProps): ReactElement {
  return (
    <Icon className={className}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  )
}
