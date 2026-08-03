import { useState, type ReactElement } from 'react'
import { explorerTxUrl } from '../config'
import { useTransactionSafety } from '../context/TransactionSafetyContext'
import { useToast } from '../hooks/useToast'
import { checkTransactionStatus } from '../lib/transactionStatus'
import { truncateAddress } from '../lib/format'
import { isAppError } from '../types'
import { AlertTriangleIcon, ExternalLinkIcon, Spinner } from './icons'

interface CheckFeedback {
  transactionKey: string
  message: string
}

/**
 * A persistent, app-wide guard for writes whose finality is still in progress
 * or unknown. It deliberately offers no blind retry path.
 */
export function TransactionSafetyBanner(): ReactElement | null {
  const { trackedTransaction, resolveTrackedTransaction } = useTransactionSafety()
  const { notify } = useToast()
  const [checking, setChecking] = useState(false)
  const [checkFeedback, setCheckFeedback] = useState<CheckFeedback | null>(null)

  const transactionKey = trackedTransaction
    ? `${trackedTransaction.id}:${trackedTransaction.updatedAt}`
    : ''
  const visibleFeedback =
    checkFeedback?.transactionKey === transactionKey ? checkFeedback.message : null

  async function recheckStatus(): Promise<void> {
    if (!trackedTransaction?.hash || checking) return

    const { hash, label, id } = trackedTransaction
    const requestedTransactionKey = transactionKey
    setChecking(true)
    setCheckFeedback(null)

    const result = await checkTransactionStatus(hash)

    if (result === 'success') {
      const resolved = await resolveTrackedTransaction(id)
      if (resolved) notify('success', `${label} was confirmed on Stellar Testnet.`)
    } else if (result === 'failed') {
      const resolved = await resolveTrackedTransaction(id)
      if (resolved) {
        notify(
          'error',
          `${label} failed on Stellar Testnet. Actions are unlocked; review the form before trying again.`,
        )
      }
    } else if (result === 'not_found') {
      setCheckFeedback({
        transactionKey: requestedTransactionKey,
        message:
          'Stellar does not have a final result for this hash yet. Actions remain locked; wait a few seconds, then check again.',
      })
      notify('info', 'No final result yet. Transaction actions remain locked.')
    } else if (isAppError(result)) {
      setCheckFeedback({ transactionKey: requestedTransactionKey, message: result.message })
      notify('error', result.message)
    }

    setChecking(false)
  }

  async function unlockAfterWalletCheck(): Promise<void> {
    if (!trackedTransaction || checking) return
    const resolved = await resolveTrackedTransaction(trackedTransaction.id)
    if (resolved) {
      notify('info', 'Transaction actions unlocked. Review your balances before submitting again.')
    } else {
      notify('info', 'The active transaction changed. The newer transaction remains protected.')
    }
  }

  if (!trackedTransaction) return null

  const isInFlight = trackedTransaction.state === 'in_flight'

  return (
    <section
      id="transaction-safety-banner"
      role={isInFlight ? 'status' : 'alert'}
      aria-busy={isInFlight || checking}
      className="border-b border-warning-500/30 bg-warning-500/10"
    >
      <div className="mx-auto flex w-full max-w-7xl items-start gap-3 px-4 py-4 text-sm text-warning-100 lg:px-6">
        {isInFlight ? (
          <Spinner className="mt-0.5 h-5 w-5 shrink-0 text-warning-400" />
        ) : (
          <AlertTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-warning-400" />
        )}

        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {isInFlight
              ? `${trackedTransaction.label} is in progress`
              : 'Confirmation needs checking'}
          </p>
          <p className="mt-1 font-mono text-xs text-warning-200/80">
            {trackedTransaction.market} · {trackedTransaction.network}
            {trackedTransaction.address
              ? ` · ${truncateAddress(trackedTransaction.address)}`
              : ' · signing wallet unavailable'}
          </p>
          {trackedTransaction.summary ? (
            <p className="mt-1 text-xs text-warning-200/80">{trackedTransaction.summary}</p>
          ) : null}

          {isInFlight ? (
            <p className="mt-1 text-warning-200/80">
              {trackedTransaction.phase === 'building'
                ? 'Everspan is preparing the transaction and checking its expected result.'
                : trackedTransaction.phase === 'signing'
                  ? 'Finish or reject the request in your wallet.'
                  : 'The transaction was submitted and is waiting for Stellar confirmation.'}{' '}
              Other financial actions are paused until this finishes.
            </p>
          ) : (
            <>
              <p className="mt-1 text-warning-200/80">
                Everspan could not verify the final outcome of {trackedTransaction.label}. Do not
                submit it again until you check its status or your wallet activity.
              </p>
              {trackedTransaction.error ? (
                <p className="mt-2 text-xs text-warning-200/80">
                  Last update: {trackedTransaction.error.message}
                </p>
              ) : null}
            </>
          )}

          {trackedTransaction.hash ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href={explorerTxUrl(trackedTransaction.hash)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-semibold text-warning-100 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-300"
              >
                View on Stellar Expert
                <ExternalLinkIcon className="h-3.5 w-3.5" />
              </a>

              {!isInFlight ? (
                <button
                  type="button"
                  disabled={checking}
                  onClick={() => {
                    void recheckStatus()
                  }}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-warning-300 px-4 py-2 font-semibold text-warning-100 transition-colors duration-100 hover:bg-warning-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-300 disabled:cursor-wait disabled:opacity-60"
                >
                  {checking ? <Spinner className="h-4 w-4" /> : null}
                  {checking ? 'Checking…' : 'Recheck status'}
                </button>
              ) : null}
              {!isInFlight ? (
                <button
                  type="button"
                  disabled={checking}
                  onClick={() => {
                    void unlockAfterWalletCheck()
                  }}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-warning-300 px-4 py-2 font-semibold text-warning-100 transition-colors duration-100 hover:bg-warning-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-300"
                >
                  I verified the result — unlock actions
                </button>
              ) : null}
            </div>
          ) : !isInFlight ? (
            <div className="mt-3">
              <p className="text-xs text-warning-200/80">
                Only unlock after checking your wallet activity and balances. Unlocking does not
                cancel a transaction that may already have been submitted.
              </p>
              <button
                type="button"
                disabled={checking}
                onClick={() => {
                  void unlockAfterWalletCheck()
                }}
                className="mt-2 inline-flex min-h-11 items-center justify-center rounded-lg border border-warning-300 px-4 py-2 font-semibold text-warning-100 transition-colors duration-100 hover:bg-warning-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-300"
              >
                I checked my wallet — unlock actions
              </button>
            </div>
          ) : null}

          {visibleFeedback ? (
            <p aria-live="polite" className="mt-3 font-medium text-warning-100">
              {visibleFeedback}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
