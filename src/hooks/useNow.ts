/** Ticking chain-time clock (ms), for countdowns and live figures. */
import { useEffect, useState } from 'react'
import { chainNowMs } from '../lib/chainTime'

/**
 * Chain-time "now" in ms, re-read every `intervalMs`. Uses chain time (not the
 * local clock) so countdowns and maturity checks agree with ledger timestamps.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => chainNowMs())
  useEffect(() => {
    const t = window.setInterval(() => {
      setNow(chainNowMs())
    }, intervalMs)
    return () => {
      window.clearInterval(t)
    }
  }, [intervalMs])
  return now
}
