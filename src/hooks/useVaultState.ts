/** Hook to read and refresh the vault's funding-pot state (works with no wallet connected). */
import { useCallback, useEffect, useRef, useState } from 'react'
import { readVaultState, type VaultState } from '../lib/contract'
import { isAppError, type AppError } from '../types'

export interface UseVaultStateResult {
  state: VaultState | null
  loading: boolean
  error: AppError | null
  /** Refetch the vault state on demand (e.g. after a deposit/withdraw or a live event). */
  refresh: () => void
}

/**
 * Fetch the vault's total/goal/contributors/own-balance. Refetches when
 * `address` changes and on demand via `refresh`; stale responses are ignored.
 * @param address - Connected account public key, or null when disconnected.
 */
export function useVaultState(address: string | null): UseVaultStateResult {
  const [state, setState] = useState<VaultState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<AppError | null>(null)
  const requestId = useRef(0)

  const fetchState = useCallback(async (): Promise<void> => {
    const id = requestId.current + 1
    requestId.current = id

    setLoading(true)
    setError(null)
    const result = await readVaultState(address)
    if (id !== requestId.current) {
      return // superseded by a newer request
    }

    if (isAppError(result)) {
      setError(result)
    } else {
      setState(result)
    }
    setLoading(false)
  }, [address])

  // Intentional data-fetching effect: fetchState writes loading/error/state in
  // response to an address change. These writes don't feed back into the effect's
  // deps, so there is no render cascade despite the synchronous loading update.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchState()
  }, [fetchState])

  const refresh = useCallback((): void => {
    void fetchState()
  }, [fetchState])

  return { state, loading, error, refresh }
}
