/** The tinted plate a concept icon sits on, so its tone has an area to read in. */
import type { ReactElement, ReactNode } from 'react'
import { FIGURE_TILE, type FigureTone } from '../lib/figures'

const SIZE = {
  sm: 'h-9 w-9',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
} as const

interface IconTileProps {
  tone: FigureTone
  size?: keyof typeof SIZE
  /** For a tile on an ember fill, where the tone below it has nothing to sit on. */
  inverted?: boolean
  className?: string
  children: ReactNode
}

export function IconTile({
  tone,
  size = 'md',
  inverted = false,
  className = '',
  children,
}: IconTileProps): ReactElement {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-xl ring-1 ring-inset transition-colors duration-100 ease-out ${
        SIZE[size]
      } ${inverted ? 'bg-onAccent/15 text-onAccent ring-onAccent/25' : FIGURE_TILE[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
