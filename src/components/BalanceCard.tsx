/** Shows the account's XLM balance with refresh, skeleton loading, and a Friendbot path. */
import { useState } from 'react'
import type { ReactElement } from 'react'
import { fundTestnetAccount } from '../lib/friendbot'
import { isAppError, type AppError } from '../types'
import { useToast } from '../hooks/useToast'
import { RefreshIcon, Spinner } from './icons'

interface BalanceCardProps {
  address: string
  balance: string | null
  funded: boolean
  loading: boolean
  error: AppError | null
  onRefresh: () => void
}

/** Group the integer part and keep up to 7 decimals (min 2), without float rounding. */
function formatXlm(raw: string): string {
  const [intPart = '0', fracRaw = ''] = raw.split('.')
  const grouped = Number(intPart).toLocaleString('en-US')
  let frac = fracRaw.replace(/0+$/, '')
  if (frac.length < 2) frac = frac.padEnd(2, '0')
  return `${grouped}.${frac}`
}

export function BalanceCard({
  address,
  balance,
  funded,
  loading,
  error,
  onRefresh,
}: BalanceCardProps): ReactElement {
  const { notify } = useToast()
  const [funding, setFunding] = useState(false)

  async function handleFund(): Promise<void> {
    setFunding(true)
    const result = await fundTestnetAccount(address)
    setFunding(false)
    if (isAppError(result)) {
      notify(result.code === 'already_funded' ? 'info' : 'error', result.message)
      if (result.code === 'already_funded') onRefresh()
      return
    }
    notify('success', 'Account funded with 10,000 test XLM.')
    onRefresh()
  }

  return (
    <section
      aria-labelledby="balance-heading"
      className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 sm:p-6"
    >
      <div className="flex items-center justify-between">
        <h2 id="balance-heading" className="text-sm font-medium text-neutral-400">
          Your balance
        </h2>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh balance"
          className="grid h-10 w-10 place-items-center rounded-lg border border-neutral-800 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:opacity-50"
        >
          {loading ? <Spinner className="h-4 w-4" /> : <RefreshIcon className="h-4 w-4" />}
        </button>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-2" aria-hidden="true">
            <div className="h-11 w-52 animate-pulse rounded-lg bg-neutral-800" />
          </div>
        ) : error ? (
          <div className="space-y-3">
            <p className="text-sm text-neutral-300">{error.message}</p>
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-lg border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
            >
              Try again
            </button>
          </div>
        ) : funded ? (
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-4xl font-semibold tracking-tight tabular-nums text-neutral-50 sm:text-5xl">
              {balance ? formatXlm(balance) : '0.00'}
            </span>
            <span className="text-base font-medium text-neutral-400">XLM</span>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-neutral-300">
              This account isn’t funded yet. On Testnet you can fund it instantly with Friendbot to
              receive 10,000 test XLM.
            </p>
            <button
              type="button"
              onClick={() => {
                void handleFund()
              }}
              disabled={funding}
              aria-busy={funding}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 active:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {funding ? (
                <>
                  <Spinner className="h-4 w-4" />
                  Funding…
                </>
              ) : (
                'Fund with Friendbot'
              )}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
