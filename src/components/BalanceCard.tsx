/** Shows the account's XLM balance with refresh, skeleton loading, and a Friendbot path. */
import { useState } from 'react'
import type { ReactElement } from 'react'
import { fundTestnetAccount } from '../lib/friendbot'
import { isAppError, type AppError } from '../types'
import { useToast } from '../hooks/useToast'
import { useTransactionSafety } from '../context/TransactionSafetyContext'
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
  // Group as a string: the balance arrives as a decimal string from Horizon and
  // may exceed what a double represents exactly.
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
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
  const { online, trackedTransaction } = useTransactionSafety()
  const [funding, setFunding] = useState(false)
  const fundingBlocked = !online || trackedTransaction !== null

  async function handleFund(): Promise<void> {
    if (funding || fundingBlocked) return
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
      className="rounded-2xl border border-hairline bg-neutral-900 p-5 sm:p-6"
    >
      <div className="flex items-center justify-between">
        <h2 id="balance-heading" className="text-sm font-medium text-neutral-400">
          XLM balance <span className="font-normal text-neutral-400">· for network fees</span>
        </h2>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh balance"
          aria-busy={loading}
          className="grid h-11 w-11 place-items-center rounded-lg border border-boundary text-neutral-400 transition-colors hover:bg-raised hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 disabled:opacity-50"
        >
          {loading ? <Spinner className="h-4 w-4" /> : <RefreshIcon className="h-4 w-4" />}
        </button>
      </div>

      <div className="mt-4">
        {loading ? (
          <div role="status" aria-live="polite" aria-label="Loading XLM balance">
            <div aria-hidden="true" className="h-11 w-52 animate-pulse rounded-lg bg-raised" />
          </div>
        ) : error ? (
          <div role="alert" className="space-y-3">
            <p className="text-sm text-neutral-300">{error.message}</p>
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex min-h-11 items-center rounded-lg border border-boundary px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
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
              disabled={funding || fundingBlocked}
              aria-busy={funding}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-onAccent transition-colors duration-100 hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 active:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
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
            {fundingBlocked ? (
              <p className="text-xs text-neutral-400">
                {online
                  ? 'Funding is paused until the current transaction is resolved.'
                  : 'Reconnect to the internet before funding this account.'}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  )
}
