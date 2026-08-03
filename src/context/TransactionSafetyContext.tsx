/* eslint-disable react-refresh/only-export-components -- provider and hook share one module. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import type { TxPhase } from '../lib/contracts/base'
import type { AppError } from '../types'

const STORAGE_KEY = 'everspan:active-transaction'

export interface TrackedTransaction {
  label: string
  hash: string | null
  phase: TxPhase
  error: AppError | null
  address: string | null
  market: string
  state: 'in_flight' | 'uncertain'
  updatedAt: number
}

interface TransactionSafetyValue {
  online: boolean
  persistenceAvailable: boolean
  trackedTransaction: TrackedTransaction | null
  resolutionVersion: number
  trackTransaction: (transaction: Omit<TrackedTransaction, 'state' | 'updatedAt'>) => boolean
  markUncertain: (transaction: Omit<TrackedTransaction, 'state' | 'updatedAt'>) => void
  clearTrackedTransaction: () => void
  resolveTrackedTransaction: () => void
}

const TransactionSafetyContext = createContext<TransactionSafetyValue | null>(null)

function readStoredTransaction(): TrackedTransaction | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    const restored = restoreTrackedTransaction(raw)
    if (raw && !restored) window.sessionStorage.removeItem(STORAGE_KEY)
    return restored
  } catch {
    return null
  }
}

/** Convert a persisted runner record into a conservative post-reload lock. */
export function restoreTrackedTransaction(raw: string | null): TrackedTransaction | null {
  try {
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<TrackedTransaction>
    if (
      typeof value.label !== 'string' ||
      (value.hash !== null && typeof value.hash !== 'string') ||
      (value.phase !== 'building' && value.phase !== 'signing' && value.phase !== 'pending')
    ) {
      return null
    }
    // A reload while simulation/building is safe to release: the wallet had
    // not been asked to sign yet. Signing and submission records stay locked.
    if (value.phase === 'building') return null
    // Reloading terminates the runner that owned an in-flight record, so its
    // finality becomes uncertain until explicitly checked.
    return {
      label: value.label,
      hash: value.hash ?? null,
      phase: value.phase,
      address: typeof value.address === 'string' ? value.address : null,
      market: typeof value.market === 'string' ? value.market : 'Unknown market',
      error:
        value.error && typeof value.error.code === 'string' && typeof value.error.message === 'string'
          ? value.error
          : null,
      state: 'uncertain',
      updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
    }
  } catch {
    return null
  }
}

function canPersistTransaction(): boolean {
  try {
    const probeKey = 'everspan:transaction-storage-probe'
    window.sessionStorage.setItem(probeKey, '1')
    window.sessionStorage.removeItem(probeKey)
    return true
  } catch {
    return false
  }
}

/** Keeps network and transaction-safety state alive across panels and reloads. */
export function TransactionSafetyProvider({ children }: { children: ReactNode }): ReactElement {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [persistenceAvailable, setPersistenceAvailable] = useState(canPersistTransaction)
  const [trackedTransaction, setTrackedTransaction] = useState<TrackedTransaction | null>(
    readStoredTransaction,
  )
  const [resolutionVersion, setResolutionVersion] = useState(0)

  useEffect(() => {
    const handleOnline = (): void => setOnline(true)
    const handleOffline = (): void => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const store = useCallback((transaction: TrackedTransaction): boolean => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(transaction))
      setTrackedTransaction(transaction)
      return true
    } catch {
      setPersistenceAvailable(false)
      return false
    }
  }, [])

  const trackTransaction = useCallback(
    (transaction: Omit<TrackedTransaction, 'state' | 'updatedAt'>): boolean => {
      return store({ ...transaction, state: 'in_flight', updatedAt: Date.now() })
    },
    [store],
  )

  const markUncertain = useCallback(
    (transaction: Omit<TrackedTransaction, 'state' | 'updatedAt'>): void => {
      const uncertain = { ...transaction, state: 'uncertain' as const, updatedAt: Date.now() }
      if (!store(uncertain)) {
        // A write may already have reached the wallet before storage failed.
        // Keep the current page locked even though reload protection is gone.
        setTrackedTransaction(uncertain)
      }
    },
    [store],
  )

  const clearTrackedTransaction = useCallback((): void => {
    setTrackedTransaction(null)
    try {
      window.sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // Nothing else is required when storage is unavailable.
    }
  }, [])

  const resolveTrackedTransaction = useCallback((): void => {
    clearTrackedTransaction()
    // Consumers key account-scoped form/data state by this value. External
    // resolution must reset staged multi-step flows, not only hide the banner.
    setResolutionVersion((current) => current + 1)
  }, [clearTrackedTransaction])

  const value = useMemo<TransactionSafetyValue>(
    () => ({
      online,
      persistenceAvailable,
      trackedTransaction,
      resolutionVersion,
      trackTransaction,
      markUncertain,
      clearTrackedTransaction,
      resolveTrackedTransaction,
    }),
    [
      online,
      persistenceAvailable,
      trackedTransaction,
      resolutionVersion,
      trackTransaction,
      markUncertain,
      clearTrackedTransaction,
      resolveTrackedTransaction,
    ],
  )

  return (
    <TransactionSafetyContext.Provider value={value}>
      {children}
    </TransactionSafetyContext.Provider>
  )
}

export function useTransactionSafety(): TransactionSafetyValue {
  const context = useContext(TransactionSafetyContext)
  if (!context) throw new Error('useTransactionSafety must be used within TransactionSafetyProvider.')
  return context
}
