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
    <div className="border-t border-hairline pt-4">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
        Underlying yield
        {rateInfo && (
          <span
            aria-hidden="true"
            title="Live"
            className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-positive-400"
          />
        )}
      </p>
      <p className="mt-1.5 text-2xl font-medium tabular-nums tracking-[-0.03em] text-neutral-50">
        {apy !== null
          ? formatPercent(apy)
          : liveRate !== null
            ? rateToDecimal(liveRate).toFixed(6)
            : '—'}
        {apy !== null && <span className="ml-1 text-sm text-neutral-500">APY</span>}
      </p>
      {liveRate !== null && (
        <p className="mt-0.5 font-mono text-[11px] tabular-nums text-neutral-600">
          {apy !== null ? `rate ${rateToDecimal(liveRate).toFixed(6)}` : 'live rate'}
        </p>
      )}
    </div>
  )
}
