/** Live exchange-rate ticker with a per-minute yield estimate. */
import type { ReactElement } from 'react'
import type { RateInfo } from '../lib/contracts/mockToken'
import { useLiveRate } from '../hooks/useLiveRate'
import { ratePerMinutePct, rateToDecimal } from '../lib/yield'
import { TrendingUpIcon } from './icons'

interface RateTickerProps {
  rateInfo: RateInfo | null
}

export function RateTicker({ rateInfo }: RateTickerProps): ReactElement {
  const liveRate = useLiveRate(rateInfo)
  const pctPerMin = rateInfo ? ratePerMinutePct(rateInfo.slopePerSec) : 0

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-neutral-800 bg-neutral-900/60 px-3.5 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
        <TrendingUpIcon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
          mUSDY exchange rate
        </p>
        <p className="font-mono text-lg font-semibold tabular-nums text-neutral-50">
          {liveRate === null ? '—' : rateToDecimal(liveRate).toFixed(6)}
          {rateInfo && (
            <span className="ml-2 text-xs font-normal text-emerald-400">
              ≈ +{pctPerMin.toFixed(2)}%/min
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
