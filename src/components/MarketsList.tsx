/** Markets tab: every maturity's fixed-rate market at a glance. */
import type { ReactElement } from 'react'
import type { MaturityPool } from '../hooks/usePools'
import { useNow } from '../hooks/useNow'
import { formatAmount, formatMaturity } from '../lib/format'
import { maturityCountdown } from '../lib/yield'
import { formatPercent, impliedFixedApy, underlyingApy } from '../lib/amm'
import type { RateInfo } from '../lib/contracts/mockToken'
import { ArrowRightIcon, ChartBarIcon, ClockIcon } from './icons'

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

  return (
    <section
      id="panel-markets"
      role="tabpanel"
      aria-labelledby="tab-markets"
      className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 sm:p-6"
    >
      <div className="flex items-center gap-2">
        <ChartBarIcon className="h-4 w-4 text-neutral-400" />
        <h2 className="text-sm font-medium text-neutral-400">Fixed-rate markets</h2>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Buy the Principal Token below par to lock a fixed yield until maturity.
      </p>

      {loading && pools.length === 0 ? (
        <div className="mt-5 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} aria-hidden="true" className="h-20 animate-pulse rounded-xl bg-neutral-800/50" />
          ))}
        </div>
      ) : pools.length === 0 ? (
        <p className="mt-5 text-sm text-neutral-400">
          No maturities exist yet. The admin creates a maturity (and its pool) before trading opens.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {pools.map((mp) => (
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

  return (
    <li className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        {/* Maturity + countdown */}
        <div className="min-w-[8rem]">
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Maturity</p>
          <p className="mt-0.5 text-sm font-medium text-neutral-100">{formatMaturity(maturity)}</p>
          {countdown.matured ? (
            <span className="mt-1 inline-block rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
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

        {/* Fixed APY — the headline */}
        <div className="min-w-[6rem]">
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            Fixed APY
          </p>
          <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-emerald-300">
            {fixedApy === null ? '—' : formatPercent(fixedApy)}
          </p>
        </div>

        {/* Underlying APY */}
        <div className="min-w-[6rem]">
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            Underlying
          </p>
          <p className="mt-0.5 font-mono text-sm tabular-nums text-neutral-300">
            {underApy === null ? '—' : formatPercent(underApy)}
          </p>
        </div>

        {/* Liquidity */}
        <div className="min-w-[6rem]">
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            Liquidity
          </p>
          <p className="mt-0.5 font-mono text-sm tabular-nums text-neutral-300">
            {pool === null ? 'No pool' : `${formatAmount(pool.syReserve)} SY`}
          </p>
        </div>

        {/* Action */}
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => {
              onTrade(maturity)
            }}
            disabled={!hasLiquidity || countdown.matured}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
          >
            Lock rate
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  )
}
