/** Hook that polls the vault's contract events for a live activity feed. */
import { useEffect, useRef, useState } from 'react'
import { fetchVaultEvents, type VaultEvent } from '../lib/events'
import { isAppError } from '../types'

const POLL_INTERVAL_MS = 5000
const MAX_EVENTS = 25

/**
 * Poll the vault contract's events every 5s, keeping the newest 25,
 * deduped by event id. `onNewEvents` fires with each freshly-seen batch so
 * the caller can refresh the funding-pot totals in near-real-time.
 */
export function useVaultEvents(onNewEvents?: (events: VaultEvent[]) => void): VaultEvent[] {
  const [events, setEvents] = useState<VaultEvent[]>([])
  const cursorRef = useRef<string | undefined>(undefined)
  const seenIds = useRef<Set<string>>(new Set())
  const onNewEventsRef = useRef(onNewEvents)
  useEffect(() => {
    onNewEventsRef.current = onNewEvents
  })

  useEffect(() => {
    let cancelled = false

    async function poll(): Promise<void> {
      const result = await fetchVaultEvents(cursorRef.current)
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
