/** Shared runner for a write call's tx lifecycle (pending → success/error + toast). */
import { useCallback, useState } from 'react'
import type { OnTxPhase, TxPhase } from '../lib/contracts/base'
import { isAppError, type AppError } from '../types'
import type { TxOutcome } from '../components/TxStatus'
import { useToast } from './useToast'
import {
  isResolvedLocalUncertainty,
  isUncertainSubmission,
  isWriteBlocked,
} from '../lib/txSafety'
import { useTransactionSafety } from '../context/TransactionSafetyContext'
import { useWallet } from '../context/WalletContext'
import { activeMarket } from '../lib/market'

const TX_TIMEOUT_MS = 90_000
const TIMEOUT_ERROR: AppError = {
  code: 'transaction_timeout',
  message:
    'This request is taking longer than expected. Check your wallet or transaction status before continuing.',
}

export interface UseTxRunnerResult {
  outcome: TxOutcome | null
  pending: boolean
  /** True while offline or another transaction is active/needs checking. */
  blocked: boolean
  /**
   * Run a write `fn`, tracking the tx lifecycle under `label`. On success,
   * `onDone` fires (e.g. to refresh reads). A user-declined signature quietly
   * resets to idle; any other error surfaces in the TxStatus card + a toast.
   */
  run: (
    label: string,
    fn: (onPhase: OnTxPhase) => Promise<{ hash: string } | AppError>,
    onDone?: () => void,
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
    trackTransaction,
    markUncertain,
    clearTrackedTransaction,
  } = useTransactionSafety()
  const { address: walletAddress } = useWallet()
  const [outcome, setOutcome] = useState<TxOutcome | null>(null)
  const [pending, setPending] = useState(false)

  const run = useCallback(
    async (
      label: string,
      fn: (onPhase: OnTxPhase) => Promise<{ hash: string } | AppError>,
      onDone?: () => void,
    ): Promise<void> => {
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
              'Secure session storage is unavailable. Enable site storage before signing a transaction.',
          },
          hash: null,
          phase: 'building',
        })
        return
      }
      if (trackedTransaction) return

      setPending(true)
      setOutcome({ status: 'pending', label, hash: null, phase: 'building' })
      const identity = { address: walletAddress, market: activeMarket().label }
      const persisted = trackTransaction({
        label,
        hash: null,
        phase: 'building',
        error: null,
        ...identity,
      })
      if (!persisted) {
        setPending(false)
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
        return
      }
      let submittedHash: string | null = null
      let lastPhase: TxPhase = 'building'
      let timedOut = false

      // Keep the hash once it arrives. The submit callback is the only phase
      // that carries one; every poll after it calls back with none, and
      // overwriting with null made the hash — and with it the only handle on an
      // in-flight transaction — flash into the pending card and vanish again.
      const onPhase: OnTxPhase = (phase, hash) => {
        lastPhase = phase
        if (hash) submittedHash = hash
        const record = {
          label,
          hash: hash ?? submittedHash,
          phase,
          error: null,
          ...identity,
        }
        if (timedOut) {
          markUncertain({
            ...record,
            phase: phase === 'building' ? 'signing' : phase,
            error: TIMEOUT_ERROR,
          })
          return
        }
        if (!trackTransaction(record)) {
          markUncertain({
            ...record,
            phase: phase === 'building' ? 'signing' : phase,
            error: {
              code: 'transaction_storage_unavailable',
              message:
                'Session storage became unavailable. Keep this page open and verify the transaction before continuing.',
            },
          })
        }
        setOutcome((prev) => ({
          status: 'pending',
          label,
          phase,
          hash: hash ?? (prev?.status === 'pending' ? prev.hash : null),
        }))
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
      setPending(false)
      const finalPhase = lastPhase as TxPhase

      if (isAppError(result)) {
        if (result.code === 'user_declined' && finalPhase === 'signing' && submittedHash === null) {
          clearTrackedTransaction()
          setOutcome(null)
          return
        }
        const safetyPhase: TxPhase =
          result.code === 'transaction_timeout' && finalPhase === 'building' ? 'signing' : finalPhase
        const failedOutcome: TxOutcome = {
          status: 'error',
          label,
          error: result,
          hash: submittedHash,
          phase: safetyPhase,
        }
        setOutcome(failedOutcome)
        if (isUncertainSubmission(failedOutcome)) {
          markUncertain({
            label,
            hash: submittedHash,
            phase: safetyPhase,
            error: result,
            ...identity,
          })
        } else {
          clearTrackedTransaction()
        }
        notify('error', result.message)
        return
      }

      clearTrackedTransaction()
      setOutcome({ status: 'success', label, hash: result.hash })
      notify('success', `${label} confirmed.`)
      onDone?.()
    },
    [
      online,
      persistenceAvailable,
      trackedTransaction,
      trackTransaction,
      markUncertain,
      clearTrackedTransaction,
      notify,
      walletAddress,
    ],
  )

  const reset = useCallback((): void => {
    // An uncertain submission must stay visible and block another write until
    // the user has checked it. Amount/mode changes may clear ordinary outcomes.
    setOutcome((current) => (isUncertainSubmission(current) ? current : null))
  }, [])

  // The session-level record is the single source of truth for an uncertain
  // submission. Once the banner resolves or explicitly unlocks that record,
  // do not leave the originating form disabled or showing stale retry advice.
  const visibleOutcome =
    isResolvedLocalUncertainty(outcome, trackedTransaction !== null) ? null : outcome

  return {
    outcome: visibleOutcome,
    pending,
    blocked: isWriteBlocked(online, trackedTransaction !== null, persistenceAvailable),
    run,
    reset,
  }
}
