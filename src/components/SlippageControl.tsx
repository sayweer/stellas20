/** Preset slippage-tolerance selector (basis points). */
import type { ReactElement } from 'react'

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
            className={`min-h-11 rounded-md px-3 py-2 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 ${
              bps === p.bps
                ? 'bg-raised text-neutral-100'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}
