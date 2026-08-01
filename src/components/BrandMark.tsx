/**
 * The Everspan brand mark: a four-pointed star split down the middle — the
 * principal half and the yield half of the same asset.
 *
 * Kept out of `icons.tsx` on purpose: those are stroked 24-unit lucide-style
 * glyphs, this is a filled 100-unit brand asset. Paths are the canonical ones
 * from the brand kit (`favicon.svg`), recoloured to `currentColor` so it can
 * sit on any surface.
 */
import type { ReactElement } from 'react'

interface BrandMarkProps {
  className?: string
}

export function BrandMark({ className = 'h-4 w-4' }: BrandMarkProps): ReactElement {
  return (
    <svg viewBox="0 0 100 100" fill="currentColor" className={className} aria-hidden="true">
      <path d="M50,8 C48,29 29,48 8,50 C29,52 48,71 50,92 Z" transform="translate(-5,0)" />
      <path d="M50,8 C52,29 71,48 92,50 C71,52 52,71 50,92 Z" transform="translate(5,0)" />
    </svg>
  )
}
