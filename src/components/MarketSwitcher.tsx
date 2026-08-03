/**
 * Switches which deployment the whole app talks to. Each market is a separate
 * yield source with its own vault, Market and pool — nothing carries over — so
 * the parent remounts its content on a change rather than trying to reconcile
 * two sets of balances.
 */
import type { KeyboardEvent, ReactElement } from 'react'
import { markets, type MarketKey } from '../config'

interface MarketSwitcherProps {
  active: MarketKey
  onChange: (key: MarketKey) => void
}

export function MarketSwitcher({ active, onChange }: MarketSwitcherProps): ReactElement | null {
  // With a single deployment there is nothing to switch between.
  if (markets.length < 2) return null
  const current = markets.find((m) => m.key === active) ?? markets[0]

  function moveFocus(currentIndex: number, event: KeyboardEvent<HTMLButtonElement>): void {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % markets.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + markets.length) % markets.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = markets.length - 1
    }
    if (nextIndex === null) return
    event.preventDefault()
    const next = markets[nextIndex]
    onChange(next.key)
    window.requestAnimationFrame(() => {
      document.getElementById(`market-${next.key}`)?.focus()
    })
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        role="radiogroup"
        aria-label="Yield source"
        className="inline-flex max-w-full shrink-0 overflow-x-auto rounded-xl border border-boundary bg-neutral-900 p-1"
      >
        {markets.map((market, index) => {
          const selected = market.key === active
          return (
            <button
              key={market.key}
              id={`market-${market.key}`}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                onChange(market.key)
              }}
              onKeyDown={(event) => moveFocus(index, event)}
              className={`min-h-11 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 ${
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
      <p className="hidden truncate text-xs text-neutral-400 xl:block">{current.yieldSource}</p>
    </div>
  )
}
