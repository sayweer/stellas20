/**
 * The underlying yield source's headline number.
 *
 * A source that publishes a forward slope (the mock) can be annualized into an
 * APY. A lending pool can only tell us its rate right now, so this shows that
 * rate and says so rather than annualizing a single sample into a number that
 * would swing wildly.
 */
import type { ReactElement } from 'react'
import type { RateInfo } from '../lib/contracts/underlying'
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
  const hasCurve = rateInfo !== null && rateInfo.slopePerSec > 0n
  const apy = hasCurve && liveRate !== null ? underlyingApy(rateInfo.slopePerSec, liveRate) : null

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
          {apy !== null ? (
            `${formatPercent(apy)} APY`
          ) : liveRate !== null ? (
            rateToDecimal(liveRate).toFixed(6)
          ) : (
            '—'
          )}
          {liveRate !== null && (
            <span className="ml-2 text-xs font-normal text-neutral-400">
              {apy !== null ? `rate ${rateToDecimal(liveRate).toFixed(6)}` : 'live rate'}
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
