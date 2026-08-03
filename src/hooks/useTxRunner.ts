/** Shared runner for a write call's tx lifecycle (pending → success/error + toast). */
import { useCallback, useRef, useState } from 'react'
import type { OnTxPhase, TxPhase } from '../lib/contracts/base'
import { isAppError, type AppError } from '../types'
import type { TxOutcome } from '../components/TxStatus'
import { useToast } from './useToast'
import { isResolvedLocalUncertainty, isUncertainSubmission, isWriteBlocked } from '../lib/txSafety'
import { useTransactionSafety, type TransactionDraft } from '../context/TransactionSafetyContext'
import { useWallet } from '../context/WalletContext'
import { activeMarket } from '../lib/market'

const TX_TIMEOUT_MS = 90_000
const TIMEOUT_ERROR: AppError = {
  code: 'transaction_timeout',
  message:
    'This request is taking longer than expected. Check your wallet or transaction status before continuing.',
}
const STORAGE_ERROR: AppError = {
  code: 'transaction_storage_unavailable',
  message:
    'The reload-safe transaction record could not be updated. Do not repeat this action until the active transaction notice is resolved.',
}

export interface UseTxRunnerResult {
  outcome: TxOutcome | null
  pending: boolean
  /** True while offline or another transaction is active/needs checking. */
  blocked: boolean
  /**
   * Run a write `fn`, tracking the tx lifecycle under `label`. `summary` is
   * persisted with the safety record so recovery names the exact intent.
   */
  run: (
    label: string,
    fn: (onPhase: OnTxPhase) => Promise<{ hash: string } | AppError>,
    onDone?: () => void,
    summary?: string,
  ) => Promise<void>
  /** Clear the current outcome card (e.g. when switching tabs/maturities). */
  reset: () => void
}

export function useTxRunner(): UseTxRunnerResult {
  const { notify } = useToast()
  const {
    online,
    persistenceAvailable,
    trackedTransaction,
    claimTransaction,
    updateTransaction,
    markUncertain,
    releaseTrackedTransaction,
    completeTrackedTransaction,
  } = useTransactionSafety()
  const { address: walletAddress } = useWallet()
  const [outcome, setOutcome] = useState<TxOutcome | null>(null)
  const [pending, setPending] = useState(false)
  // React state cannot close the same-tick double-click window. This ref is the
  // runner-local mutex; the provider claim is the cross-runner/tab mutex.
  const runnerActive = useRef(false)

  const run = useCallback(
    async (
      label: string,
      fn: (onPhase: OnTxPhase) => Promise<{ hash: string } | AppError>,
      onDone?: () => void,
      summary?: string,
    ): Promise<void> => {
      if (runnerActive.current) return
      runnerActive.current = true

      try {
        if (!online) {
          setOutcome({
            status: 'error',
            label,
            error: {
              code: 'offline',
              message: 'You are offline. Reconnect before submitting this transaction.',
            },
            hash: null,
            phase: 'building',
          })
          return
        }
        if (!persistenceAvailable) {
          setOutcome({
            status: 'error',
            label,
            error: {
              code: 'transaction_storage_unavailable',
              message:
                'Secure site storage is unavailable. Enable site storage before signing a transaction.',
            },
            hash: null,
            phase: 'building',
          })
          return
        }
        if (trackedTransaction) return

        const market = activeMarket()
        const initial: TransactionDraft = {
          label,
          hash: null,
          phase: 'building',
          error: null,
          address: walletAddress,
          market: market.label,
          marketKey: market.key,
          network: 'Stellar Testnet',
          summary: summary ?? null,
        }
        const claim = await claimTransaction(initial)
        if (!claim.ok) {
          if (claim.reason === 'storage_error') {
            setOutcome({
              status: 'error',
              label,
              error: {
                code: 'transaction_storage_unavailable',
                message:
                  'Everspan could not create a reload-safe transaction record. No wallet request was sent.',
              },
              hash: null,
              phase: 'building',
            })
          }
          return
        }

        const transactionId = claim.id
        setPending(true)
        setOutcome({
          status: 'pending',
          label,
          hash: null,
          phase: 'building',
          transactionId,
        })

        let submittedHash: string | null = null
        let lastPhase: TxPhase = 'building'
        let timedOut = false
        let stoppedBeforeWallet = false

        // Keep the hash once it arrives. Every poll after submission calls back
        // without one, so replacing it with null would erase the recovery handle.
        const onPhase: OnTxPhase = (phase, hash) => {
          lastPhase = phase
          if (hash) submittedHash = hash
          const record: TransactionDraft = {
            ...initial,
            hash: hash ?? submittedHash,
            phase,
          }

          if (timedOut) {
            // The timeout path already persisted uncertainty. Late phase
            // callbacks must never resurrect a record the user resolved.
            return false
          }

          const write = updateTransaction(transactionId, record)
          if (write === 'stale') return false
          if (write === 'storage_error') {
            if (phase === 'building' || phase === 'signing') {
              // invokeWrite observes false and stops before signAndSend.
              stoppedBeforeWallet = true
              lastPhase = 'building'
              return false
            }
            markUncertain(transactionId, { ...record, error: STORAGE_ERROR })
          }

          setOutcome({
            status: 'pending',
            label,
            phase,
            hash: hash ?? submittedHash,
            transactionId,
          })
          return write === 'updated'
        }

        let result: { hash: string } | AppError
        let timeoutId: number | undefined
        try {
          result = await Promise.race([
            fn(onPhase),
            new Promise<AppError>((resolve) => {
              timeoutId = window.setTimeout(() => {
                timedOut = true
                resolve(TIMEOUT_ERROR)
              }, TX_TIMEOUT_MS)
            }),
          ])
        } catch {
          result = {
            code: 'unexpected_error',
            message: 'Something interrupted this transaction. Check its status before continuing.',
          }
        } finally {
          if (timeoutId !== undefined) window.clearTimeout(timeoutId)
        }

        if (isAppError(result)) {
          const finalPhase = (stoppedBeforeWallet ? 'building' : lastPhase) as TxPhase
          if (
            result.code === 'user_declined' &&
            finalPhase === 'signing' &&
            submittedHash === null
          ) {
            await releaseTrackedTransaction(transactionId)
            setOutcome(null)
            return
          }

          const safetyPhase: TxPhase =
            result.code === 'transaction_timeout' && finalPhase === 'building'
              ? 'signing'
              : finalPhase
          const failedOutcome: TxOutcome = {
            status: 'error',
            label,
            error: stoppedBeforeWallet ? STORAGE_ERROR : result,
            hash: submittedHash,
            phase: safetyPhase,
            transactionId,
          }
          setOutcome(failedOutcome)
          if (isUncertainSubmission(failedOutcome)) {
            markUncertain(transactionId, {
              ...initial,
              hash: submittedHash,
              phase: safetyPhase,
              error: failedOutcome.error,
            })
          } else {
            await releaseTrackedTransaction(transactionId)
          }
          notify('error', failedOutcome.error.message)
          return
        }

        // Ownership is checked under the cross-tab lock before any local
        // completion side effect. A late result from a resolved/stale runner
        // cannot mutate a newer transaction's form or continuation record.
        const completed = await completeTrackedTransaction(transactionId, onDone)
        if (completed) {
          setOutcome({ status: 'success', label, hash: result.hash })
          notify('success', `${label} confirmed.`)
        } else {
          setOutcome(null)
        }
      } finally {
        setPending(false)
        runnerActive.current = false
      }
    },
    [
      online,
      persistenceAvailable,
      trackedTransaction,
      claimTransaction,
      updateTransaction,
      markUncertain,
      releaseTrackedTransaction,
      completeTrackedTransaction,
      notify,
      walletAddress,
    ],
  )

  const reset = useCallback((): void => {
    // An uncertain submission must stay visible and block another write until
    // the user has checked it. Amount/mode changes may clear ordinary outcomes.
    setOutcome((current) => (isUncertainSubmission(current) ? current : null))
  }, [])

  // Hide a runner-local uncertainty once its exact global owner was resolved.
  // A newer transaction must not keep an older warning attached to this form.
  const visibleOutcome = isResolvedLocalUncertainty(outcome, trackedTransaction?.id ?? null)
    ? null
    : outcome

  return {
    outcome: visibleOutcome,
    pending,
    blocked: isWriteBlocked(online, trackedTransaction !== null, persistenceAvailable),
    run,
    reset,
  }
}
