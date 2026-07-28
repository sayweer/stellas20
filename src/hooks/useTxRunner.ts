/** Shared runner for a write call's tx lifecycle (pending → success/error + toast). */
import { useCallback, useState } from 'react'
import type { OnTxPhase } from '../lib/contracts/base'
import { isAppError, type AppError } from '../types'
import type { TxOutcome } from '../components/TxStatus'
import { useToast } from './useToast'

export interface UseTxRunnerResult {
  outcome: TxOutcome | null
  pending: boolean
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
  const [outcome, setOutcome] = useState<TxOutcome | null>(null)
  const [pending, setPending] = useState(false)

  const run = useCallback(
    async (
      label: string,
      fn: (onPhase: OnTxPhase) => Promise<{ hash: string } | AppError>,
      onDone?: () => void,
    ): Promise<void> => {
      setPending(true)
      setOutcome({ status: 'pending', label, hash: null })

      // Keep the hash once it arrives. The submit callback is the only phase
      // that carries one; every poll after it calls back with none, and
      // overwriting with null made the hash — and with it the only handle on an
      // in-flight transaction — flash into the pending card and vanish again.
      const onPhase: OnTxPhase = (_phase, hash) => {
        setOutcome((prev) => ({
          status: 'pending',
          label,
          hash: hash ?? (prev?.status === 'pending' ? prev.hash : null),
        }))
      }
      const result = await fn(onPhase)
      setPending(false)

      if (isAppError(result)) {
        if (result.code === 'user_declined') {
          setOutcome(null)
          return
        }
        setOutcome({ status: 'error', label, error: result as AppError })
        notify('error', result.message)
        return
      }

      setOutcome({ status: 'success', label, hash: result.hash })
      notify('success', `${label} confirmed.`)
      onDone?.()
    },
    [notify],
  )

  const reset = useCallback((): void => {
    setOutcome(null)
  }, [])

  return { outcome, pending, run, reset }
}
