/** Hook to fetch and refresh the connected account's native XLM balance. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { getXlmBalance } from '../lib/stellar'
import { isAppError, type AppError } from '../types'

/** Balance state for the connected account. */
export interface UseBalanceResult {
  /** Native XLM balance as a string, or null when unknown / unfunded. */
  balance: string | null
  /** Whether the account exists on-chain. */
  funded: boolean
  loading: boolean
  error: AppError | null
  /** Refetch the balance on demand. */
  refresh: () => void
}

/**
 * Fetch the XLM balance for `address` via the Stellar service. Refetches when the
 * address changes and on demand via `refresh`; stale responses are ignored.
 * @param address - Connected account public key, or null when disconnected.
 */
export function useBalance(address: string | null): UseBalanceResult {
  const [balance, setBalance] = useState<string | null>(null)
  const [funded, setFunded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const requestId = useRef(0)

  const fetchBalance = useCallback(async (): Promise<void> => {
    const id = requestId.current + 1
    requestId.current = id

    if (!address) {
      setBalance(null)
      setFunded(false)
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    const result = await getXlmBalance(address)
    if (id !== requestId.current) {
      return // superseded by a newer request
    }

    if (isAppError(result)) {
      setError(result)
      setBalance(null)
      setFunded(false)
    } else if (result.funded) {
      setBalance(result.balance)
      setFunded(true)
    } else {
      setBalance(null)
      setFunded(false)
    }
    setLoading(false)
  }, [address])

  // Intentional data-fetching effect: fetchBalance writes loading/error/balance in
  // response to an address change. These writes don't feed back into the effect's deps,
  // so there is no render cascade despite the synchronous loading update.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchBalance()
  }, [fetchBalance])

  const refresh = useCallback((): void => {
    void fetchBalance()
  }, [fetchBalance])

  return { balance, funded, loading, error, refresh }
}
