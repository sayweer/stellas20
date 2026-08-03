/** The account's liquidity positions, with pro-rata value and a manage link. */
import type { ReactElement } from 'react'
import type { MaturityPool } from '../hooks/usePools'
import { formatAmount, formatMaturity } from '../lib/format'
import { quoteRemoveLiquidity } from '../lib/amm'
import { ArrowRightIcon, LayersIcon } from './icons'

interface LpPositionsProps {
  pools: MaturityPool[]
  onManage: (maturity: bigint) => void
}

export function LpPositions({ pools, onManage }: LpPositionsProps): ReactElement | null {
  const held = pools.filter((p) => p.lpBalance > 0n && p.pool !== null)
  if (held.length === 0) return null

  return (
    <section
      aria-labelledby="lp-heading"
      className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6"
    >
      <div className="flex items-center gap-2">
        <LayersIcon className="h-4 w-4 text-neutral-400" />
        <h2 id="lp-heading" className="text-sm font-medium text-neutral-400">
          Liquidity positions
        </h2>
      </div>

      <ul className="mt-4 space-y-3">
        {held.map((mp) => {
          const pool = mp.pool
          if (pool === null) return null
          const { ptOut, syOut } = quoteRemoveLiquidity(
            { ptReserve: pool.ptReserve, syReserve: pool.syReserve, lpTotal: pool.lpTotal },
            mp.lpBalance,
          )
          const share =
            pool.lpTotal > 0n ? Number((mp.lpBalance * 10_000n) / pool.lpTotal) / 100 : 0
          return (
            <li
              key={mp.maturity.toString()}
              className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium text-neutral-200">
                  {formatMaturity(mp.maturity)}
                </span>
                <span className="text-xs tabular-nums text-neutral-400">
                  {share.toFixed(2)}% of pool
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-neutral-500">Shares</dt>
                  <dd className="font-mono tabular-nums text-neutral-100">
                    {formatAmount(mp.lpBalance)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-neutral-500">PT value</dt>
                  <dd className="font-mono tabular-nums text-neutral-100">{formatAmount(ptOut)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-neutral-500">SY value</dt>
                  <dd className="font-mono tabular-nums text-neutral-100">{formatAmount(syOut)}</dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => {
                  onManage(mp.maturity)
                }}
                className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-2 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60"
              >
                Manage in Pool
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
