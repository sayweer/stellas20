import type { TxPhase } from './contracts/base'

interface TxState {
  status: string
  hash?: string | null
  phase?: TxPhase
}

/** Once signing starts, the opaque wallet/send call may have reached the RPC
 * even when neither a hash nor a pending callback made it back to the UI.
 * User-declined requests are removed before they become an error outcome. */
export function isUncertainSubmission(outcome: TxState | null): boolean {
  return (
    outcome?.status === 'error' &&
    (outcome.hash != null || outcome.phase === 'signing' || outcome.phase === 'pending')
  )
}

/** Hide a form-local uncertainty after the app-wide record was resolved. */
export function isResolvedLocalUncertainty(
  outcome: TxState | null,
  hasTrackedTransaction: boolean,
): boolean {
  return !hasTrackedTransaction && isUncertainSubmission(outcome)
}

/** Writes are globally blocked by connectivity or one active safety record. */
export function isWriteBlocked(
  online: boolean,
  hasTrackedTransaction: boolean,
  persistenceAvailable = true,
): boolean {
  return !online || hasTrackedTransaction || !persistenceAvailable
}
