/** Hook that polls the protocol's contract events for a live activity feed. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchProtocolEvents, type ProtocolEvent } from '../lib/events'
import { isAppError, type AppError } from '../types'

const POLL_INTERVAL_MS = 5000
const MAX_EVENTS = 25

/**
 * Poll the protocol's events every 5s, keeping the newest 25, deduped by id.
 * `onNewEvents` fires with each freshly-seen batch so the caller can refresh
 * portfolio totals in near-real-time.
 */
export interface UseProtocolEventsResult {
  events: ProtocolEvent[]
  loading: boolean
  error: AppError | null
  retry: () => void
}

export function useProtocolEvents(
  onNewEvents?: (events: ProtocolEvent[]) => void,
  filterAddress?: string | null,
): UseProtocolEventsResult {
  const [events, setEvents] = useState<ProtocolEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<AppError | null>(null)
  const retryRef = useRef<() => void>(() => undefined)
  const cursorRef = useRef<string | undefined>(undefined)
  const seenIds = useRef<Set<string>>(new Set())
  const onNewEventsRef = useRef(onNewEvents)
  useEffect(() => {
    onNewEventsRef.current = onNewEvents
  })

  useEffect(() => {
    let cancelled = false
    let inFlight = false
    cursorRef.current = undefined
    seenIds.current = new Set()
    // A wallet switch must never leave the previous account's activity on
    // screen while the first request for the new account is in flight.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset state when the feed scope changes.
    setEvents([])
    setLoading(filterAddress !== null)
    setError(null)

    if (filterAddress === null) {
      retryRef.current = () => undefined
      return
    }
    const addressFilter = filterAddress

    async function poll(): Promise<void> {
      if (inFlight) return
      inFlight = true
      try {
        const result = await fetchProtocolEvents(cursorRef.current, addressFilter)
        if (cancelled) return
        setLoading(false)
        if (isAppError(result)) {
          setError(result)
          return
        }
        setError(null)
        cursorRef.current = result.cursor
        if (result.events.length === 0) return

        const fresh = result.events.filter((e) => !seenIds.current.has(e.id))
        if (fresh.length === 0) return
        fresh.forEach((e) => seenIds.current.add(e.id))
        // The cursor prevents re-delivering old events, so the seen set only needs
        // to cover recent overlap — keep it bounded on long sessions.
        if (seenIds.current.size > 500) {
          seenIds.current = new Set(fresh.map((e) => e.id))
        }

        // The RPC returns events oldest-first; show newest-first in the feed.
        const newestFirst = [...fresh].reverse()
        setEvents((prev) => [...newestFirst, ...prev].slice(0, MAX_EVENTS))
        onNewEventsRef.current?.(fresh)
      } finally {
        inFlight = false
      }
    }

    retryRef.current = () => {
      setLoading(true)
      void poll()
    }
    void poll()
    const interval = window.setInterval(() => {
      void poll()
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [filterAddress])

  const retry = useCallback((): void => retryRef.current(), [])
  return { events, loading, error, retry }
}
