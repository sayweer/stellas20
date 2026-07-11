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

      const onPhase: OnTxPhase = (_phase, hash) => {
        setOutcome({ status: 'pending', label, hash: hash ?? null })
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

  return { outcome, pending, run }
}
