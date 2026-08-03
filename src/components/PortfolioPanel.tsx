/** Position summary: total PT, open maturities, and live claimable yield. */
import type { ReactElement } from 'react'
import type { Portfolio } from '../hooks/usePortfolio'
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
    { label: 'PT (all maturities)', value: disconnected ? '—' : formatAmount(totalPt) },
    { label: 'Open maturities', value: disconnected ? '—' : String(portfolio.positions.length) },
    {
      label: 'Claimable yield',
      value: disconnected || totalClaimable === null ? '—' : formatAmount(totalClaimable, 6),
      accent: true,
    },
  ]

  return (
    <section aria-labelledby="portfolio-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1
          id="portfolio-heading"
          data-panel-heading
          tabIndex={-1}
          className="text-lg font-medium tracking-[-0.02em] text-neutral-100 outline-none"
        >
          Portfolio
        </h1>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh portfolio"
          aria-busy={loading}
          className="grid h-11 w-11 place-items-center rounded-lg border border-boundary text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 disabled:opacity-50"
        >
          {loading ? <Spinner className="h-4 w-4" /> : <RefreshIcon className="h-4 w-4" />}
        </button>
      </div>

      {error ? (
        <div role="alert" className="mt-4 space-y-3">
          <p className="text-sm text-neutral-300">{error.message}</p>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex min-h-11 items-center rounded-lg border border-boundary px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
          >
            Try again
          </button>
        </div>
      ) : (
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                    stat.accent ? 'text-positive-300' : 'text-neutral-50'
                  }`}
                >
                  {stat.value}
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}
      {loading && address ? (
        <span role="status" aria-live="polite" className="sr-only">
          Loading portfolio
        </span>
      ) : null}
    </section>
  )
}
