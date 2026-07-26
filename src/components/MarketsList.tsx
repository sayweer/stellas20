/** Markets tab: every maturity's fixed-rate market at a glance. */
import { useState } from 'react'
import type { ReactElement } from 'react'
import type { MaturityPool } from '../hooks/usePools'
import { useNow } from '../hooks/useNow'
import { formatAmount, formatMaturity } from '../lib/format'
import { maturityCountdown } from '../lib/yield'
import { formatPercent, impliedFixedApy, underlyingApy } from '../lib/amm'
import type { RateInfo } from '../lib/contracts/underlying'
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
    <section id="panel-markets" role="tabpanel" aria-labelledby="tab-markets">
      <header>
        <h2 className="text-lg font-medium tracking-[-0.02em] text-neutral-100">
          Fixed-rate markets
        </h2>
        <p className="mt-1 text-sm text-neutral-400">
          Buy the Principal Token below par to lock a fixed yield until maturity.
        </p>
      </header>

      {loading && pools.length === 0 ? (
        <div className="mt-6 space-y-px">
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
            <ul className="mt-6 divide-y divide-neutral-800">
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
            <div className="mt-6 border-t border-neutral-800 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowMatured((v) => !v)
                }}
                aria-expanded={showMatured}
                className="rounded text-xs font-medium uppercase tracking-[0.14em] text-neutral-500 transition-colors hover:text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60"
              >
                {showMatured ? 'Hide' : 'Show'} matured ({matured.length})
              </button>
              {showMatured && (
                <ul className="mt-2 divide-y divide-neutral-800">
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
  const { maturity, pool } = mp
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
  const underApy = rateInfo && liveRate ? underlyingApy(rateInfo.slopePerSec, liveRate) : null

  // PT can trade above par, which implies a negative fixed rate — a real market
  // state, not an error. It must never be painted in the "good" colour.
  const apyTone =
    fixedApy === null
      ? 'text-neutral-600'
      : fixedApy < 0
        ? 'text-negative-300'
        : 'text-positive-300'

  return (
    <li className="flex flex-wrap items-center gap-x-8 gap-y-4 py-5">
      <div className="min-w-[8rem]">
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
            {String(countdown.hours).padStart(2, '0')}:{String(countdown.minutes).padStart(2, '0')}
          </span>
        )}
      </div>

      <div className="min-w-[6.5rem]">
        <Label>Fixed APY</Label>
        <p className={`mt-1 text-2xl font-medium tabular-nums tracking-[-0.03em] ${apyTone}`}>
          {fixedApy === null ? '—' : formatPercent(fixedApy)}
        </p>
      </div>

      <div className="min-w-[5.5rem]">
        <Label>Underlying</Label>
        <p className="mt-1 text-sm tabular-nums text-neutral-300">
          {underApy === null ? '—' : formatPercent(underApy)}
        </p>
      </div>

      <div className="min-w-[6rem]">
        <Label>Liquidity</Label>
        <p className="mt-1 text-sm tabular-nums text-neutral-300">
          {pool === null ? 'No pool' : `${formatAmount(pool.syReserve)} SY`}
        </p>
      </div>

      <div className="ml-auto">
        <button
          type="button"
          onClick={() => {
            onTrade(maturity)
          }}
          disabled={!hasLiquidity || countdown.matured}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent-500 px-4 py-2 text-sm font-medium text-neutral-950 transition-colors hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600"
        >
          Lock rate
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </button>
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
