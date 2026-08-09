/**
 * Preset slippage-tolerance selector (basis points).
 *
 * Trackless and compact: the presets sit inline after their label rather than
 * inside a segmented track, so they take the shared segment paint at the small
 * size instead of carrying their own.
 */
import type { ReactElement } from 'react'
import { segmentClasses } from '../lib/buttonStyles'

const PRESETS: { bps: number; label: string }[] = [
  { bps: 50, label: '0.5%' },
  { bps: 100, label: '1%' },
  { bps: 200, label: '2%' },
]

interface SlippageControlProps {
  bps: number
  onChange: (bps: number) => void
}

export function SlippageControl({ bps, onChange }: SlippageControlProps): ReactElement {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-neutral-400">Max slippage</span>
      <div role="group" aria-label="Max slippage" className="inline-flex gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.bps}
            type="button"
            aria-pressed={bps === p.bps}
            onClick={() => {
              onChange(p.bps)
            }}
            className={`${segmentClasses(bps === p.bps, 'sm')} tabular-nums`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}
