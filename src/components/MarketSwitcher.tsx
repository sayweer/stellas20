/**
 * Switches which deployment the whole app talks to. Each market is a separate
 * yield source with its own vault, Market and pool — nothing carries over — so
 * the parent remounts its content on a change rather than trying to reconcile
 * two sets of balances.
 */
import type { ReactElement } from 'react'
import { markets, type MarketKey } from '../config'

interface MarketSwitcherProps {
  active: MarketKey
  onChange: (key: MarketKey) => void
}

export function MarketSwitcher({ active, onChange }: MarketSwitcherProps): ReactElement | null {
  // With a single deployment there is nothing to switch between.
  if (markets.length < 2) return null
  const current = markets.find((m) => m.key === active) ?? markets[0]

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div
        role="radiogroup"
        aria-label="Yield source"
        className="inline-flex rounded-xl border border-neutral-800 bg-neutral-900/60 p-1"
      >
        {markets.map((market) => {
          const selected = market.key === active
          return (
            <button
              key={market.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                onChange(market.key)
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60 ${
                selected
                  ? 'bg-neutral-800 text-neutral-50'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {market.label}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-neutral-400">{current.yieldSource}</p>
    </div>
  )
}
