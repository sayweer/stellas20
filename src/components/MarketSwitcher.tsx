/**
 * Switches which deployment the whole app talks to. Each market is a separate
 * yield source with its own vault, Market and pool — nothing carries over — so
 * the parent remounts its content on a change rather than trying to reconcile
 * two sets of balances.
 */
import type { KeyboardEvent, ReactElement } from 'react'
import { markets, type MarketKey } from '../config'
import { useTransactionSafety } from '../context/TransactionSafetyContext'
import { focusRing, segmentClasses, segmentTrackClass } from '../lib/buttonStyles'
import { CheckIcon } from './icons'

interface MarketSwitcherProps {
  active: MarketKey
  onChange: (key: MarketKey) => void
  /**
   * `inline` is the pill track the desktop header shows. `stacked` is the same
   * radiogroup as a full-width list, which is what a sheet on a phone wants —
   * only the paint differs, the roles and the roving focus are shared.
   */
  layout?: 'inline' | 'stacked'
  /**
   * The inline group is hidden with CSS below `lg` rather than unmounted, so
   * when the sheet is open both copies are in the DOM. They must not answer to
   * the same ids — `getElementById` would hand the roving focus to whichever
   * one happens to come first, which is the invisible one.
   */
  idPrefix?: string
}

export function MarketSwitcher({
  active,
  onChange,
  layout = 'inline',
  idPrefix = 'market-',
}: MarketSwitcherProps): ReactElement | null {
  const { trackedTransaction } = useTransactionSafety()
  const switchingBlocked = trackedTransaction?.state === 'in_flight'
  // With a single deployment there is nothing to switch between.
  if (markets.length < 2) return null
  const current = markets.find((m) => m.key === active) ?? markets[0]

  function moveFocus(currentIndex: number, event: KeyboardEvent<HTMLButtonElement>): void {
    if (switchingBlocked) return
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
      document.getElementById(`${idPrefix}${next.key}`)?.focus()
    })
  }

  const stacked = layout === 'stacked'

  return (
    <div className={stacked ? '' : 'flex min-w-0 items-center gap-3'}>
      <div
        role="radiogroup"
        aria-label="Yield source"
        aria-disabled={switchingBlocked}
        className={
          stacked
            ? 'flex flex-col gap-1'
            : `inline-flex max-w-full shrink-0 overflow-x-auto rounded-full bg-neutral-900 ${segmentTrackClass}`
        }
      >
        {markets.map((market, index) => {
          const selected = market.key === active
          return (
            <button
              key={market.key}
              id={`${idPrefix}${market.key}`}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              disabled={switchingBlocked && !selected}
              title={
                switchingBlocked && !selected
                  ? 'Wait for the active transaction to finish'
                  : undefined
              }
              onClick={() => {
                onChange(market.key)
              }}
              onKeyDown={(event) => moveFocus(index, event)}
              className={
                stacked
                  ? `flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${focusRing} ${
                      selected ? 'bg-raised text-neutral-50' : 'text-neutral-300 hover:bg-raised/60'
                    }`
                  : `${segmentClasses(selected)} whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50`
              }
            >
              {stacked ? (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{market.label}</span>
                    <span className="block truncate text-xs font-normal text-neutral-400">
                      {market.yieldSource}
                    </span>
                  </span>
                  {selected && <CheckIcon className="h-4 w-4 shrink-0 text-accent-300" />}
                </>
              ) : (
                market.label
              )}
            </button>
          )
        })}
      </div>
      <p className="hidden truncate text-xs text-neutral-400 xl:block">{current.yieldSource}</p>
    </div>
  )
}
