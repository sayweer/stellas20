/** Hook that batch-reads every maturity's AMM pool state + the account's LP. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { readLpBalance, readPool, type PoolView } from '../lib/contracts/amm'
import { isAppError } from '../types'

/** A maturity, its pool (null if none created), and the account's LP shares. */
export interface MaturityPool {
  maturity: bigint
  /** Pool reserves/state, or null when no pool exists for this maturity. */
  pool: PoolView | null
  /**
   * True when the read itself failed rather than the pool being absent. Both
   * arrive as a null `pool`, but they mean opposite things to a user: "this
   * maturity has no market" is permanent, a dropped RPC call is not. Reporting
   * a transient failure as "No pool" told people a live market did not exist.
   */
  unavailable: boolean
  /** The connected account's LP shares in this pool (0 while disconnected). */
  lpBalance: bigint
}

export interface UsePoolsResult {
  pools: MaturityPool[]
  loading: boolean
  refresh: () => void
  refreshSilent: () => void
}

/** Refetch every minute so a quiet chain still recovers a transient read error. */
const PERIODIC_MS = 60_000

/**
 * Read every maturity's pool state (public) and, when connected, the account's
 * LP balance per pool — all in parallel. A pool that doesn't exist reads as
 * `pool: null` (not an error): pools are opt-in per maturity. Refetches on
 * address/maturities change, on demand, and every minute; stale responses are
 * ignored.
 */
export function usePools(address: string | null, maturities: bigint[]): UsePoolsResult {
  const [pools, setPools] = useState<MaturityPool[]>([])
  const [loading, setLoading] = useState(true)
  const requestId = useRef(0)
  // Stable key so the effect doesn't re-run on a fresh array with equal values.
  const maturitiesKey = maturities.map((m) => m.toString()).join(',')

  const fetchAll = useCallback(
    async (background = false): Promise<void> => {
      const id = requestId.current + 1
      requestId.current = id
      if (!background) setLoading(true)

      const list = maturitiesKey === '' ? [] : maturitiesKey.split(',').map((s) => BigInt(s))
      const results = await Promise.all(
        list.map(async (maturity): Promise<MaturityPool> => {
          const [poolRes, lpRes] = await Promise.all([
            readPool(maturity),
            address ? readLpBalance(address, maturity) : Promise.resolve(0n),
          ])
          const absent = isAppError(poolRes) && poolRes.code === 'pool_not_found'
          return {
            maturity,
            pool: isAppError(poolRes) ? null : poolRes,
            unavailable: isAppError(poolRes) && !absent,
            lpBalance: isAppError(lpRes) ? 0n : lpRes,
          }
        }),
      )
      if (id !== requestId.current) return
      setPools(results)
      setLoading(false)
    },
    [address, maturitiesKey],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAll()
    const interval = window.setInterval(() => {
      void fetchAll(true)
    }, PERIODIC_MS)
    return () => {
      window.clearInterval(interval)
    }
  }, [fetchAll])

  const refresh = useCallback((): void => {
    void fetchAll()
  }, [fetchAll])

  const refreshSilent = useCallback((): void => {
    void fetchAll(true)
  }, [fetchAll])

  return { pools, loading, refresh, refreshSilent }
}
