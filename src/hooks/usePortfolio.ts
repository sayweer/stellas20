/** Hook that batch-reads the connected account's full protocol portfolio. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { readUnderlyingBalance, readRateInfo, type RateInfo } from '../lib/contracts/underlying'
import { readSyBalance } from '../lib/contracts/syVault'
import { readAccount, readMaturities, type AccountView } from '../lib/contracts/splitter'
import { isAppError, type AppError } from '../types'

/** A maturity and the connected account's position in it. */
export interface MaturityPosition {
  maturity: bigint
  position: AccountView
}

export interface Portfolio {
  /** Underlying-asset balance for the active market (0 while disconnected). */
  underlying: bigint
  /** SY balance (0 while disconnected). */
  sy: bigint
  /** Current rate checkpoint (public; available while disconnected). */
  rateInfo: RateInfo | null
  /** All registered maturities. */
  maturities: bigint[]
  /** Per-maturity positions for the connected account. */
  positions: MaturityPosition[]
}

export interface UsePortfolioResult {
  portfolio: Portfolio
  loading: boolean
  error: AppError | null
  /** Foreground refetch (shows the loading state). */
  refresh: () => void
  /** Background refetch (keeps current data visible, no spinner). */
  refreshSilent: () => void
}

const EMPTY: Portfolio = { underlying: 0n, sy: 0n, rateInfo: null, maturities: [], positions: [] }

/** Refetch every minute so a quiet chain still recovers a transient read error. */
const PERIODIC_MS = 60_000

/**
 * Read maturities + rate info (public) and, when connected, the account's
 * underlying/SY balances and per-maturity positions — all in parallel. Refetches on
 * address change, on demand, and every minute; stale responses are ignored. A
 * failed balance read surfaces as `error` rather than silently reading zero.
 */
export function usePortfolio(address: string | null): UsePortfolioResult {
  const [portfolio, setPortfolio] = useState<Portfolio>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<AppError | null>(null)
  const requestId = useRef(0)

  const fetchAll = useCallback(
    async (background = false): Promise<void> => {
      const id = requestId.current + 1
      requestId.current = id
      if (!background) setLoading(true)
      setError(null)

      const [maturitiesRes, rateRes] = await Promise.all([readMaturities(), readRateInfo()])
      if (id !== requestId.current) return
      if (isAppError(maturitiesRes)) {
        setError(maturitiesRes)
        setLoading(false)
        return
      }
      const rateInfo = isAppError(rateRes) ? null : rateRes

      if (!address) {
        setPortfolio({ underlying: 0n, sy: 0n, rateInfo, maturities: maturitiesRes, positions: [] })
        setLoading(false)
        return
      }

      const [underlyingRes, syRes, ...positionResults] = await Promise.all([
        readUnderlyingBalance(address),
        readSyBalance(address),
        ...maturitiesRes.map((m) => readAccount(address, m)),
      ])
      if (id !== requestId.current) return

      // A failed core balance read must not read as "you have zero".
      if (isAppError(underlyingRes) || isAppError(syRes)) {
        setError(isAppError(underlyingRes) ? underlyingRes : (syRes as AppError))
        setLoading(false)
        return
      }

      const positions: MaturityPosition[] = []
      maturitiesRes.forEach((maturity, i) => {
        const pos = positionResults[i]
        if (!isAppError(pos)) positions.push({ maturity, position: pos })
      })

      setPortfolio({ underlying: underlyingRes, sy: syRes, rateInfo, maturities: maturitiesRes, positions })
      setLoading(false)
    },
    [address],
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

  return { portfolio, loading, error, refresh, refreshSilent }
}
