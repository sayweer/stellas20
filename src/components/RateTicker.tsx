/** Live exchange-rate ticker with the underlying yield APY. */
import type { ReactElement } from 'react'
import type { RateInfo } from '../lib/contracts/mockToken'
import { useLiveRate } from '../hooks/useLiveRate'
import { rateToDecimal } from '../lib/yield'
import { formatPercent, underlyingApy } from '../lib/amm'
import { TrendingUpIcon } from './icons'

interface RateTickerProps {
  rateInfo: RateInfo | null
}

export function RateTicker({ rateInfo }: RateTickerProps): ReactElement {
  const liveRate = useLiveRate(rateInfo)
  // The underlying yield source's annualized rate (from the linear slope) — a
  // meaningful figure, unlike a raw per-minute delta at realistic rates.
  const apy = rateInfo && liveRate !== null ? underlyingApy(rateInfo.slopePerSec, liveRate) : null

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-neutral-800 bg-neutral-900/60 px-3.5 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
        <TrendingUpIcon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
          Underlying yield
        </p>
        <p className="font-mono text-lg font-semibold tabular-nums text-neutral-50">
          {apy === null ? '—' : `${formatPercent(apy)} APY`}
          {liveRate !== null && (
            <span className="ml-2 text-xs font-normal text-neutral-400">
              rate {rateToDecimal(liveRate).toFixed(6)}
            </span>
          )}
        </p>
      </div>
      {rateInfo && (
        <span
          aria-hidden="true"
          className="ml-auto h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60"
        />
      )}
    </div>
  )
}
