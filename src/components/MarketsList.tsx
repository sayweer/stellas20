/** Markets tab: every maturity's fixed-rate market at a glance. */
import { useState } from 'react'
import type { ReactElement } from 'react'
import type { MaturityPool } from '../hooks/usePools'
import { useNow } from '../hooks/useNow'
import { formatAmount, formatMaturity } from '../lib/format'
import { maturityCountdown } from '../lib/yield'
import { formatPercent, impliedFixedApy, underlyingApy } from '../lib/amm'
import type { RateInfo } from '../lib/contracts/underlying'
import { Button } from './Button'
import { ArrowRightIcon, ClockIcon } from './icons'

interface MarketsListProps {
  pools: MaturityPool[]
  loading: boolean
  rateInfo: RateInfo | null
  liveRate: bigint | null
  onTrade: (maturity: bigint) => void
}

/** Public market discovery — implied fixed APY, underlying APY, depth, countdown. */
export function MarketsList({
  pools,
  loading,
  rateInfo,
  liveRate,
  onTrade,
}: MarketsListProps): ReactElement {
  const now = useNow()
  const [showMatured, setShowMatured] = useState(false)

  // A matured maturity can no longer be traded, so it is history rather than a
  // market. Left inline it crowded the list — on a demo deployment most rows
  // were expired ones showing "—", which made the whole tab look dead.
  const live = pools.filter((mp) => !maturityCountdown(mp.maturity, now).matured)
  const matured = pools.filter((mp) => maturityCountdown(mp.maturity, now).matured)

  return (
    <section aria-labelledby="live-markets-heading">
      <header>
        <h2
          id="live-markets-heading"
          className="text-2xl font-medium tracking-[-0.035em] text-neutral-100"
        >
          Available maturities
        </h2>
        <p className="mt-1 text-sm text-neutral-400">
          Compare the implied return, time remaining, and available liquidity before choosing.
        </p>
      </header>

      {loading && pools.length === 0 ? (
        <div
          role="status"
          aria-live="polite"
          aria-label="Loading available maturities"
          className="mt-6 space-y-px"
        >
          {[0, 1, 2].map((i) => (
            <div key={i} aria-hidden="true" className="h-[4.5rem] animate-pulse bg-neutral-850" />
          ))}
        </div>
      ) : live.length === 0 && matured.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-400">
          No maturities exist yet. The admin creates a maturity (and its pool) before trading opens.
        </p>
      ) : (
        <>
          {live.length > 0 ? (
            <ul className="mt-6 space-y-3 sm:space-y-0 sm:divide-y sm:divide-hairline">
              {live.map((mp) => (
                <MarketRow
                  key={mp.maturity.toString()}
                  mp={mp}
                  nowMs={now}
                  rateInfo={rateInfo}
                  liveRate={liveRate}
                  onTrade={onTrade}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-sm text-neutral-400">
              Every maturity has expired. A new one has to be created before trading reopens.
            </p>
          )}

          {matured.length > 0 && (
            <div className="mt-6 border-t border-hairline pt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowMatured((v) => !v)
                }}
                aria-expanded={showMatured}
                className="-ml-3 uppercase tracking-[0.14em]"
              >
                {showMatured ? 'Hide' : 'Show'} matured ({matured.length})
              </Button>
              {showMatured && (
                <ul className="mt-2 space-y-3 sm:space-y-0 sm:divide-y sm:divide-hairline">
                  {matured.map((mp) => (
                    <MarketRow
                      key={mp.maturity.toString()}
                      mp={mp}
                      nowMs={now}
                      rateInfo={rateInfo}
                      liveRate={liveRate}
                      onTrade={onTrade}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}

interface MarketRowProps {
  mp: MaturityPool
  nowMs: number
  rateInfo: RateInfo | null
  liveRate: bigint | null
  onTrade: (maturity: bigint) => void
}

function MarketRow({ mp, nowMs, rateInfo, liveRate, onTrade }: MarketRowProps): ReactElement {
  const { maturity, pool, unavailable } = mp
  const countdown = maturityCountdown(maturity, nowMs)
  const dtSeconds = Number(maturity) - Math.floor(nowMs / 1000)
  const hasLiquidity = pool !== null && pool.ptReserve > 0n && pool.syReserve > 0n

  const fixedApy =
    hasLiquidity && liveRate !== null && !countdown.matured
      ? impliedFixedApy(
          { ptReserve: pool.ptReserve, syReserve: pool.syReserve },
          liveRate,
          dtSeconds,
        )
      : null
  // Only a source that publishes a forward slope can be annualized. Blend
  // reports its rate now and nothing about the future, so annualizing it gave
  // every row of the real-yield market a flat "0.00%" — the one number a reader
  // would take as "this pays nothing". Same guard the rate ticker uses.
  const hasCurve = rateInfo !== null && rateInfo.slopePerSec > 0n
  const underApy = hasCurve && liveRate ? underlyingApy(rateInfo.slopePerSec, liveRate) : null

  /*
   * PT can trade above par, which implies a negative fixed rate — a real market
   * state, not an error. Direction is carried by the sign glyph below, never by
   * the status palette: since the Ember repaint `negative` is the failed-
   * transaction colour, and painting an ordinary rate with it would tell the
   * reader something had gone wrong. Both directions read in the accent.
   */
  const apyTone = fixedApy === null ? 'text-neutral-600' : 'text-accent-300'

  const liquidity =
    pool !== null ? (
      `${formatAmount(pool.syReserve)} SY`
    ) : unavailable ? (
      <span className="text-warning-300">Unavailable</span>
    ) : (
      'No pool'
    )

  return (
    /*
     * A card on a phone, a row from `sm` up. Stacked label/value pairs on a
     * dividing line read as a spreadsheet dump: everything shouts at the same
     * volume and the reader has to assemble the offer themselves. The card puts
     * the rate first at the size it deserves, the date under it as context, and
     * the two supporting figures in a quiet strip — which is the order someone
     * actually chooses a maturity in.
     */
    <li className="rounded-2xl border border-hairline bg-neutral-900 p-4 sm:flex sm:flex-wrap sm:items-center sm:gap-x-8 sm:gap-y-4 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:py-5">
      <div className="flex items-start justify-between gap-4 sm:contents">
        <div className="min-w-0 sm:min-w-[8rem]">
          <Label>Maturity</Label>
          <p className="mt-1 text-sm font-medium text-neutral-100">{formatMaturity(maturity)}</p>
          {countdown.matured ? (
            <span className="mt-1 inline-block text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
              Matured
            </span>
          ) : (
            <span className="mt-1 inline-flex items-center gap-1 text-xs tabular-nums text-neutral-400">
              <ClockIcon className="h-3.5 w-3.5" />
              {countdown.days > 0 && `${countdown.days.toString()}d `}
              {String(countdown.hours).padStart(2, '0')}:
              {String(countdown.minutes).padStart(2, '0')}
            </span>
          )}
        </div>

        <div className="shrink-0 text-right sm:min-w-[6.5rem] sm:text-left">
          <Label>Fixed APY</Label>
          {/* The positive and negative ramps resolve to the same blue, so the
              sign is carried by a glyph. A rate below zero is a real market
              state — PT trading above par — and must never read as a gain. */}
          <p className={`mt-1 text-2xl font-medium tabular-nums tracking-[-0.03em] ${apyTone}`}>
            {fixedApy === null
              ? '—'
              : `${fixedApy < 0 ? '−' : '+'}${formatPercent(Math.abs(fixedApy))}`}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-hairline pt-3 sm:contents sm:border-0">
        <div className="min-w-0 sm:min-w-[5.5rem]">
          <Label>Underlying</Label>
          <p className="mt-1 text-sm tabular-nums text-neutral-300">
            {underApy === null ? '—' : formatPercent(underApy)}
          </p>
        </div>
        <div className="min-w-0 sm:min-w-[6rem]">
          <Label>Liquidity</Label>
          <p className="mt-1 truncate text-sm tabular-nums text-neutral-300">{liquidity}</p>
        </div>
      </div>

      <div className="mt-4 sm:ml-auto sm:mt-0">
        <Button
          variant="primary"
          full
          onClick={() => {
            onTrade(maturity)
          }}
          disabled={!hasLiquidity || countdown.matured}
          // A greyed-out button with no stated reason leaves people clicking at
          // it; say which of the two conditions is blocking.
          title={
            countdown.matured
              ? 'This maturity has passed — trading is closed'
              : !hasLiquidity
                ? 'This maturity has no liquidity yet'
                : undefined
          }
          className="sm:w-auto"
        >
          Lock rate
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  )
}

function Label({ children }: { children: string }): ReactElement {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
      {children}
    </p>
  )
}
