/** Funding-pot summary: goal, total raised, progress bar, contributor count, and the connected account's own contribution. */
import type { ReactElement } from 'react'
import { stroopsToXlm } from '../lib/amounts'
import type { VaultState } from '../lib/contract'
import type { AppError } from '../types'
import { RefreshIcon, Spinner } from './icons'

interface FundingPotProps {
  state: VaultState | null
  loading: boolean
  error: AppError | null
  onRefresh: () => void
}

/** Group the integer part and keep 2 decimals, without float rounding. */
function formatXlm(stroops: bigint): string {
  const [intPart = '0', fracRaw = ''] = stroopsToXlm(stroops).split('.')
  const grouped = Number(intPart).toLocaleString('en-US')
  const frac = fracRaw.padEnd(2, '0').slice(0, 2)
  return `${grouped}.${frac}`
}

export function FundingPot({ state, loading, error, onRefresh }: FundingPotProps): ReactElement {
  const progress =
    state && state.goal > 0n ? Math.min(100, Number((state.total * 10000n) / state.goal) / 100) : 0

  return (
    <section
      aria-labelledby="funding-pot-heading"
      className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 sm:p-6"
    >
      <div className="flex items-center justify-between">
        <h2 id="funding-pot-heading" className="text-sm font-medium text-neutral-400">
          Funding pot
        </h2>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh vault state"
          className="grid h-10 w-10 place-items-center rounded-lg border border-neutral-800 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:opacity-50"
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
            className="rounded-lg border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
          >
            Try again
          </button>
        </div>
      ) : loading && !state ? (
        <div className="mt-4 space-y-3" aria-hidden="true">
          <div className="h-9 w-40 animate-pulse rounded-lg bg-neutral-800" />
          <div className="h-2 w-full animate-pulse rounded-full bg-neutral-800" />
        </div>
      ) : state ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-semibold tracking-tight tabular-nums text-neutral-50 sm:text-4xl">
              {formatXlm(state.total)}
            </span>
            <span className="text-base font-medium text-neutral-400">
              / {formatXlm(state.goal)} XLM
            </span>
          </div>

          <div
            className="h-2 w-full overflow-hidden rounded-full bg-neutral-800"
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width]"
              style={{ width: `${progress.toString()}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>
              {state.contributors.toLocaleString('en-US')} contributor
              {state.contributors === 1 ? '' : 's'}
            </span>
            {state.myBalance > 0n && (
              <span>Your contribution: {formatXlm(state.myBalance)} XLM</span>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
