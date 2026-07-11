/** Hook that batch-reads the connected account's full protocol portfolio. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { readMytBalance, readRateInfo, type RateInfo } from '../lib/contracts/mockToken'
import { readSyBalance } from '../lib/contracts/syVault'
import { readMaturities, readPosition, type PositionView } from '../lib/contracts/splitter'
import { isAppError, type AppError } from '../types'

/** A maturity and the connected account's position in it. */
export interface MaturityPosition {
  maturity: bigint
  position: PositionView
}

export interface Portfolio {
  /** mUSDY balance (0 while disconnected). */
  myt: bigint
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
  refresh: () => void
}

const EMPTY: Portfolio = { myt: 0n, sy: 0n, rateInfo: null, maturities: [], positions: [] }

/**
 * Read maturities + rate info (public) and, when connected, the account's
 * mUSDY/SY balances and per-maturity positions — all in parallel. Refetches on
 * address change and on demand; stale responses are ignored.
 */
export function usePortfolio(address: string | null): UsePortfolioResult {
  const [portfolio, setPortfolio] = useState<Portfolio>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<AppError | null>(null)
  const requestId = useRef(0)

  const fetchAll = useCallback(async (): Promise<void> => {
    const id = requestId.current + 1
    requestId.current = id
    setLoading(true)
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
      setPortfolio({ myt: 0n, sy: 0n, rateInfo, maturities: maturitiesRes, positions: [] })
      setLoading(false)
      return
    }

    const [mytRes, syRes, ...positionResults] = await Promise.all([
      readMytBalance(address),
      readSyBalance(address),
      ...maturitiesRes.map((m) => readPosition(address, m)),
    ])
    if (id !== requestId.current) return

    const positions: MaturityPosition[] = []
    maturitiesRes.forEach((maturity, i) => {
      const pos = positionResults[i]
      if (!isAppError(pos)) positions.push({ maturity, position: pos })
    })

    setPortfolio({
      myt: isAppError(mytRes) ? 0n : mytRes,
      sy: isAppError(syRes) ? 0n : syRes,
      rateInfo,
      maturities: maturitiesRes,
      positions,
    })
    setLoading(false)
  }, [address])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAll()
  }, [fetchAll])

  const refresh = useCallback((): void => {
    void fetchAll()
  }, [fetchAll])

  return { portfolio, loading, error, refresh }
}
