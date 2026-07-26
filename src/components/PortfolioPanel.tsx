/** Top-level portfolio balances: underlying, SY, total PT, and live claimable yield. */
import type { ReactElement } from 'react'
import type { Portfolio } from '../hooks/usePortfolio'
import { activeMarket } from '../lib/market'
import { formatAmount } from '../lib/format'
import { claimableAt } from '../lib/yield'
import { chainNowMs } from '../lib/chainTime'
import type { AppError } from '../types'
import { RefreshIcon, Spinner } from './icons'

interface PortfolioPanelProps {
  address: string | null
  portfolio: Portfolio
  loading: boolean
  error: AppError | null
  liveRate: bigint | null
  onRefresh: () => void
}

interface Stat {
  label: string
  value: string
  accent?: boolean
}

export function PortfolioPanel({
  address,
  portfolio,
  loading,
  error,
  liveRate,
  onRefresh,
}: PortfolioPanelProps): ReactElement {
  const disconnected = address === null
  const totalPt = portfolio.positions.reduce((sum, p) => sum + p.position.pt, 0n)
  // Cap each position's claimable at its own maturity (mirrors the contract) so a
  // matured position with residual YT doesn't inflate the headline figure.
  const cp = portfolio.rateInfo
  const nowSec = BigInt(Math.floor(chainNowMs() / 1000))
  const totalClaimable =
    liveRate === null || cp === null
      ? null
      : portfolio.positions.reduce(
          (sum, p) => sum + claimableAt(p.position, cp, p.maturity, nowSec),
          0n,
        )

  const stats: Stat[] = [
    {
      label: activeMarket().underlyingSymbol,
      value: disconnected ? '—' : formatAmount(portfolio.underlying),
    },
    { label: 'SY', value: disconnected ? '—' : formatAmount(portfolio.sy) },
    { label: 'PT (all maturities)', value: disconnected ? '—' : formatAmount(totalPt) },
    {
      label: 'Claimable yield',
      value: disconnected || totalClaimable === null ? '—' : formatAmount(totalClaimable, 6),
      accent: true,
    },
  ]

  return (
    <section
      aria-labelledby="portfolio-heading"
      className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="portfolio-heading" className="text-sm font-medium text-neutral-400">
          Portfolio
        </h2>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh portfolio"
          className="grid h-10 w-10 place-items-center rounded-lg border border-neutral-800 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60 disabled:opacity-50"
        >
          {loading ? <Spinner className="h-4 w-4" /> : <RefreshIcon className="h-4 w-4" />}
        </button>
      </div>

      {error ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-neutral-300">{error.message}</p>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60"
          >
            Try again
          </button>
        </div>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="min-w-0 rounded-xl border border-neutral-800/80 bg-neutral-950/40 px-3 py-3"
            >
              <dt className="truncate text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                {stat.label}
              </dt>
              {loading && address ? (
                <div
                  aria-hidden="true"
                  className="mt-1.5 h-6 w-20 animate-pulse rounded bg-neutral-800"
                />
              ) : (
                <dd
                  className={`mt-1 truncate font-mono text-base font-semibold tabular-nums sm:text-lg ${
                    stat.accent ? 'text-accent-300' : 'text-neutral-50'
                  }`}
                >
                  {stat.value}
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
