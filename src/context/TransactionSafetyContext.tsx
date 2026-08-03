/* eslint-disable react-refresh/only-export-components -- provider and hook share one module. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import type { TxPhase } from '../lib/contracts/base'
import type { AppError } from '../types'

const STORAGE_KEY = 'everspan:active-transaction'
const STORAGE_PROBE_KEY = 'everspan:transaction-storage-probe'
const OWNERSHIP_LOCK = 'everspan:transaction-owner'
const RECORD_VERSION = 2 as const
const OWNER_LEASE_MS = 120_000

export interface TransactionDraft {
  label: string
  hash: string | null
  phase: TxPhase
  error: AppError | null
  address: string | null
  market: string
  marketKey: string
  network: string
  summary: string | null
}

export interface TrackedTransaction extends TransactionDraft {
  version: typeof RECORD_VERSION
  id: string
  ownerId: string | null
  state: 'in_flight' | 'uncertain'
  updatedAt: number
}

export type TransactionWriteResult = 'updated' | 'stale' | 'storage_error'
export type TransactionClaimResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'busy' | 'storage_error' }

/** Compare-and-set ownership guard shared by every update/clear path. */
export function ownsTrackedTransaction(
  transaction: Pick<TrackedTransaction, 'id'> | null,
  expectedId: string,
): boolean {
  return transaction?.id === expectedId
}

interface TransactionSafetyValue {
  online: boolean
  persistenceAvailable: boolean
  trackedTransaction: TrackedTransaction | null
  resolutionVersion: number
  dataVersion: number
  claimTransaction: (transaction: TransactionDraft) => Promise<TransactionClaimResult>
  updateTransaction: (
    transactionId: string,
    transaction: TransactionDraft,
  ) => TransactionWriteResult
  markUncertain: (transactionId: string, transaction: TransactionDraft) => boolean
  releaseTrackedTransaction: (transactionId: string) => Promise<boolean>
  completeTrackedTransaction: (transactionId: string, onOwned?: () => void) => Promise<boolean>
  resolveTrackedTransaction: (transactionId: string) => Promise<boolean>
}

const TransactionSafetyContext = createContext<TransactionSafetyValue | null>(null)

/** Parse a record without deciding whether its owning runner still exists. */
function parseStoredTransaction(raw: string | null): TrackedTransaction | null {
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

    const updatedAt = typeof value.updatedAt === 'number' ? value.updatedAt : Date.now()
    return {
      version: RECORD_VERSION,
      id:
        typeof value.id === 'string' && value.id !== ''
          ? value.id
          : `legacy:${updatedAt}:${value.label}`,
      ownerId: typeof value.ownerId === 'string' ? value.ownerId : null,
      label: value.label,
      hash: value.hash ?? null,
      phase: value.phase,
      address: typeof value.address === 'string' ? value.address : null,
      market: typeof value.market === 'string' ? value.market : 'Unknown market',
      marketKey: typeof value.marketKey === 'string' ? value.marketKey : 'unknown',
      network: typeof value.network === 'string' ? value.network : 'Stellar Testnet',
      summary: typeof value.summary === 'string' ? value.summary : null,
      error:
        value.error &&
        typeof value.error.code === 'string' &&
        typeof value.error.message === 'string'
          ? value.error
          : null,
      state: value.state === 'uncertain' ? 'uncertain' : 'in_flight',
      updatedAt,
    }
  } catch {
    return null
  }
}

/** Convert a persisted runner record into a conservative post-reload lock. */
export function restoreTrackedTransaction(
  raw: string | null,
  now = Date.now(),
): TrackedTransaction | null {
  const restored = parseStoredTransaction(raw)
  if (!restored) return null
  if (restored.state === 'uncertain') return restored
  // A fresh owner lease means another tab is still running this transaction.
  // Never expose manual recovery merely because a second tab was opened.
  if (restored.ownerId && now - restored.updatedAt < OWNER_LEASE_MS) return restored
  // A build-only record without a hash is safe to release: no wallet request
  // had begun. A malformed building record that somehow has a hash stays
  // fail-closed, because submission evidence always wins over the phase label.
  if (restored.phase === 'building' && restored.hash === null) return null
  return { ...restored, state: 'uncertain' }
}

function readStoredTransaction(): TrackedTransaction | null {
  try {
    const current = window.localStorage.getItem(STORAGE_KEY)
    const legacy = current === null ? window.sessionStorage.getItem(STORAGE_KEY) : null
    const restored = restoreTrackedTransaction(current ?? legacy)

    if (restored) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(restored))
    else window.localStorage.removeItem(STORAGE_KEY)
    window.sessionStorage.removeItem(STORAGE_KEY)
    return restored
  } catch {
    return null
  }
}

function canPersistTransaction(): boolean {
  try {
    // Without Web Locks a localStorage check-and-set is not atomic across tabs.
    // Fail closed instead of allowing two wallet prompts to race.
    if (!(navigator as Navigator & { locks?: LockManagerLike }).locks) return false
    window.localStorage.setItem(STORAGE_PROBE_KEY, '1')
    window.localStorage.removeItem(STORAGE_PROBE_KEY)
    return true
  } catch {
    return false
  }
}

function newTransactionId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}:${Math.random().toString(36).slice(2)}`
  }
}

const TAB_ID = newTransactionId()

interface LockManagerLike {
  request: <T>(name: string, callback: () => T | Promise<T>) => Promise<T>
}

function withOwnershipLock<T>(task: () => T | Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & { locks?: LockManagerLike }).locks
  return locks ? locks.request(OWNERSHIP_LOCK, task) : Promise.resolve(task())
}

function draftOf(transaction: TrackedTransaction): TransactionDraft {
  return {
    label: transaction.label,
    hash: transaction.hash,
    phase: transaction.phase,
    error: transaction.error,
    address: transaction.address,
    market: transaction.market,
    marketKey: transaction.marketKey,
    network: transaction.network,
    summary: transaction.summary,
  }
}

/** Keeps network, ownership and transaction-safety state alive across routes and tabs. */
export function TransactionSafetyProvider({ children }: { children: ReactNode }): ReactElement {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [persistenceAvailable, setPersistenceAvailable] = useState(canPersistTransaction)
  const [trackedTransaction, setTrackedTransaction] = useState<TrackedTransaction | null>(
    readStoredTransaction,
  )
  const trackedRef = useRef<TrackedTransaction | null>(trackedTransaction)
  const [resolutionVersion, setResolutionVersion] = useState(0)
  const [dataVersion, setDataVersion] = useState(0)

  const applyTracked = useCallback((transaction: TrackedTransaction | null): void => {
    trackedRef.current = transaction
    setTrackedTransaction(transaction)
  }, [])

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

  // localStorage makes the guard visible to every tab. A remote removal also
  // invalidates reads; uncertain outcomes additionally reset staged forms.
  useEffect(() => {
    const handleStorage = (event: StorageEvent): void => {
      if (event.storageArea !== window.localStorage || event.key !== STORAGE_KEY) return
      const previous = trackedRef.current
      const next = parseStoredTransaction(event.newValue)
      applyTracked(next)
      if (event.newValue === null && previous) {
        setDataVersion((current) => current + 1)
        if (previous.state === 'uncertain') {
          setResolutionVersion((current) => current + 1)
        }
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [applyTracked])

  const claimTransaction = useCallback(
    async (transaction: TransactionDraft): Promise<TransactionClaimResult> => {
      if (!(navigator as Navigator & { locks?: LockManagerLike }).locks) {
        setPersistenceAvailable(false)
        return { ok: false, reason: 'storage_error' }
      }
      return withOwnershipLock(() => {
        try {
          const raw = window.localStorage.getItem(STORAGE_KEY)
          const stored = parseStoredTransaction(raw)
          if (raw !== null && !stored) window.localStorage.removeItem(STORAGE_KEY)
          if (stored) {
            applyTracked(stored)
            return { ok: false, reason: 'busy' as const }
          }
          if (trackedRef.current) return { ok: false, reason: 'busy' as const }

          const claimed: TrackedTransaction = {
            ...transaction,
            version: RECORD_VERSION,
            id: newTransactionId(),
            ownerId: TAB_ID,
            state: 'in_flight',
            updatedAt: Date.now(),
          }
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(claimed))
          applyTracked(claimed)
          return { ok: true, id: claimed.id }
        } catch {
          setPersistenceAvailable(false)
          return { ok: false, reason: 'storage_error' as const }
        }
      })
    },
    [applyTracked],
  )

  const updateTransaction = useCallback(
    (transactionId: string, transaction: TransactionDraft): TransactionWriteResult => {
      if (!ownsTrackedTransaction(trackedRef.current, transactionId)) return 'stale'
      if (trackedRef.current?.ownerId !== TAB_ID) return 'stale'
      try {
        const stored = parseStoredTransaction(window.localStorage.getItem(STORAGE_KEY))
        if (stored?.id !== transactionId) return 'stale'
        const next: TrackedTransaction = {
          ...transaction,
          version: RECORD_VERSION,
          id: transactionId,
          ownerId: TAB_ID,
          state: 'in_flight',
          updatedAt: Date.now(),
        }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        applyTracked(next)
        return 'updated'
      } catch {
        setPersistenceAvailable(false)
        return 'storage_error'
      }
    },
    [applyTracked],
  )

  const markUncertain = useCallback(
    (transactionId: string, transaction: TransactionDraft): boolean => {
      if (!ownsTrackedTransaction(trackedRef.current, transactionId)) return false
      try {
        const stored = parseStoredTransaction(window.localStorage.getItem(STORAGE_KEY))
        if (stored?.id !== transactionId) return false
        const uncertain: TrackedTransaction = {
          ...transaction,
          version: RECORD_VERSION,
          id: transactionId,
          ownerId: trackedRef.current?.ownerId ?? null,
          state: 'uncertain',
          updatedAt: Date.now(),
        }
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(uncertain))
        } catch {
          // Keep this tab locked even if durable storage disappears mid-flight.
          setPersistenceAvailable(false)
        }
        applyTracked(uncertain)
        return true
      } catch {
        setPersistenceAvailable(false)
        applyTracked({
          ...transaction,
          version: RECORD_VERSION,
          id: transactionId,
          ownerId: trackedRef.current?.ownerId ?? null,
          state: 'uncertain',
          updatedAt: Date.now(),
        })
        return true
      }
    },
    [applyTracked],
  )

  const clearOwned = useCallback(
    async (
      transactionId: string,
      mode: 'release' | 'complete' | 'resolve',
      onOwned?: () => void,
    ): Promise<boolean> =>
      withOwnershipLock(() => {
        const current = trackedRef.current
        if (!current || !ownsTrackedTransaction(current, transactionId)) return false
        if (mode !== 'resolve' && current.ownerId !== TAB_ID) return false
        try {
          const stored = parseStoredTransaction(window.localStorage.getItem(STORAGE_KEY))
          if (!stored || stored.id !== transactionId) {
            applyTracked(stored)
            return false
          }
          try {
            onOwned?.()
          } catch {
            // Completion must still release its durable lock if a local UI
            // refresh callback disappears during an unmount.
          }
          window.localStorage.removeItem(STORAGE_KEY)
          window.sessionStorage.removeItem(STORAGE_KEY)
        } catch {
          setPersistenceAvailable(false)
          if (mode === 'release') {
            // No wallet request survived this path. The stale building record
            // is released on reload, while unavailable storage still blocks.
            applyTracked(null)
            return true
          }
          // A confirmed/uncertain chain action must remain visible if its
          // durable owner record cannot be removed.
          applyTracked({
            ...current,
            state: 'uncertain',
            error: {
              code: 'transaction_storage_unavailable',
              message:
                'The transaction record could not be cleared. Site storage must be restored before actions can be unlocked.',
            },
            updatedAt: Date.now(),
          })
          setDataVersion((value) => value + 1)
          return false
        }

        applyTracked(null)
        if (mode !== 'release') setDataVersion((value) => value + 1)
        if (mode === 'resolve') setResolutionVersion((value) => value + 1)
        return true
      }),
    [applyTracked],
  )

  const releaseTrackedTransaction = useCallback(
    (transactionId: string) => clearOwned(transactionId, 'release'),
    [clearOwned],
  )
  const completeTrackedTransaction = useCallback(
    (transactionId: string, onOwned?: () => void) =>
      clearOwned(transactionId, 'complete', onOwned),
    [clearOwned],
  )
  const resolveTrackedTransaction = useCallback(
    (transactionId: string) => clearOwned(transactionId, 'resolve'),
    [clearOwned],
  )

  // Leaving a page destroys its runner. Convert any signed/submitted record to
  // uncertainty so a surviving tab can verify it instead of waiting forever.
  useEffect(() => {
    const handlePageHide = (event: PageTransitionEvent): void => {
      const current = trackedRef.current
      if (
        event.persisted ||
        !current ||
        current.ownerId !== TAB_ID ||
        current.state !== 'in_flight'
      )
        return
      if (current.phase === 'building' && current.hash === null) {
        void releaseTrackedTransaction(current.id)
        return
      }
      markUncertain(current.id, draftOf(current))
    }
    window.addEventListener('pagehide', handlePageHide)
    return () => window.removeEventListener('pagehide', handlePageHide)
  }, [markUncertain, releaseTrackedTransaction])

  // If an owning tab vanished without pagehide, hold the lock until its lease
  // expires, then expose conservative recovery. Live owners time out first and
  // update the shared record themselves.
  useEffect(() => {
    const current = trackedTransaction
    if (!current || current.state !== 'in_flight' || current.ownerId === TAB_ID) return
    const remaining = Math.max(0, OWNER_LEASE_MS - (Date.now() - current.updatedAt))
    const timeout = window.setTimeout(() => {
      const latest = trackedRef.current
      if (!latest || latest.id !== current.id || latest.state !== 'in_flight') return
      markUncertain(latest.id, draftOf(latest))
    }, remaining)
    return () => window.clearTimeout(timeout)
  }, [trackedTransaction, markUncertain])

  const value = useMemo<TransactionSafetyValue>(
    () => ({
      online,
      persistenceAvailable,
      trackedTransaction,
      resolutionVersion,
      dataVersion,
      claimTransaction,
      updateTransaction,
      markUncertain,
      releaseTrackedTransaction,
      completeTrackedTransaction,
      resolveTrackedTransaction,
    }),
    [
      online,
      persistenceAvailable,
      trackedTransaction,
      resolutionVersion,
      dataVersion,
      claimTransaction,
      updateTransaction,
      markUncertain,
      releaseTrackedTransaction,
      completeTrackedTransaction,
      resolveTrackedTransaction,
    ],
  )

  return (
    <TransactionSafetyContext.Provider value={value}>{children}</TransactionSafetyContext.Provider>
  )
}

export function useTransactionSafety(): TransactionSafetyValue {
  const context = useContext(TransactionSafetyContext)
  if (!context)
    throw new Error('useTransactionSafety must be used within TransactionSafetyProvider.')
  return context
}
