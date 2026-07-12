/** Hook that ticks the exchange rate client-side, with zero RPC load. */
import { useEffect, useRef, useState } from 'react'
import type { RateInfo } from '../lib/contracts/mockToken'
import { chainNowMs } from '../lib/chainTime'
import { rateAt, type RateCheckpoint } from '../lib/yield'

const TICK_MS = 1000

/**
 * Given the current rate checkpoint, recompute the live exchange rate every
 * second locally (no RPC calls). Re-anchors whenever a fresh `rateInfo`
 * arrives (e.g. after a `rate_set` event or a portfolio refresh).
 * @returns the live rate (scaled by 1e12), or null until a checkpoint is known.
 */
export function useLiveRate(rateInfo: RateInfo | null): bigint | null {
  const [rate, setRate] = useState<bigint | null>(null)
  const cpRef = useRef<RateCheckpoint | null>(null)

  useEffect(() => {
    cpRef.current = rateInfo
      ? { since: rateInfo.since, rate: rateInfo.rate, slopePerSec: rateInfo.slopePerSec }
      : null
  }, [rateInfo])

  useEffect(() => {
    function tick(): void {
      const cp = cpRef.current
      if (!cp) {
        setRate(null)
        return
      }
      const nowSec = BigInt(Math.floor(chainNowMs() / 1000))
      setRate(rateAt(cp, nowSec))
    }
    tick()
    const interval = window.setInterval(tick, TICK_MS)
    return () => {
      window.clearInterval(interval)
    }
  }, [])

  return rate
}
