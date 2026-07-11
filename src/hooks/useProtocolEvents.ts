/** Hook that polls the protocol's contract events for a live activity feed. */
import { useEffect, useRef, useState } from 'react'
import { fetchProtocolEvents, type ProtocolEvent } from '../lib/events'
import { isAppError } from '../types'

const POLL_INTERVAL_MS = 5000
const MAX_EVENTS = 25

/**
 * Poll the protocol's events every 5s, keeping the newest 25, deduped by id.
 * `onNewEvents` fires with each freshly-seen batch so the caller can refresh
 * portfolio totals in near-real-time.
 */
export function useProtocolEvents(
  onNewEvents?: (events: ProtocolEvent[]) => void,
): ProtocolEvent[] {
  const [events, setEvents] = useState<ProtocolEvent[]>([])
  const cursorRef = useRef<string | undefined>(undefined)
  const seenIds = useRef<Set<string>>(new Set())
  const onNewEventsRef = useRef(onNewEvents)
  useEffect(() => {
    onNewEventsRef.current = onNewEvents
  })

  useEffect(() => {
    let cancelled = false

    async function poll(): Promise<void> {
      const result = await fetchProtocolEvents(cursorRef.current)
      if (cancelled || isAppError(result)) return
      cursorRef.current = result.cursor
      if (result.events.length === 0) return

      const fresh = result.events.filter((e) => !seenIds.current.has(e.id))
      if (fresh.length === 0) return
      fresh.forEach((e) => seenIds.current.add(e.id))

      // The RPC returns events oldest-first; show newest-first in the feed.
      const newestFirst = [...fresh].reverse()
      setEvents((prev) => [...newestFirst, ...prev].slice(0, MAX_EVENTS))
      onNewEventsRef.current?.(fresh)
    }

    void poll()
    const interval = window.setInterval(() => {
      void poll()
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  return events
}
