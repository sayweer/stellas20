/**
 * Chain-time anchor. Countdowns and the live rate must track *ledger* time, not
 * the user's local clock (which may be wrong by minutes). The event poller
 * samples the RPC's latest ledger close time every ~5s; we keep the offset from
 * the local clock and expose `chainNowMs()` for all time-sensitive UI.
 */

let offsetMs = 0
let sampled = false

/**
 * Record the chain's latest ledger close time (a unix-seconds string from the
 * Soroban RPC) and update the local-clock offset.
 */
export function noteChainTime(latestLedgerCloseTimeSec: string): void {
  const chainMs = Number(latestLedgerCloseTimeSec) * 1000
  if (Number.isFinite(chainMs) && chainMs > 0) {
    offsetMs = chainMs - Date.now()
    sampled = true
  }
}

/** Best estimate of current chain time in ms (local clock until a sample arrives). */
export function chainNowMs(): number {
  return Date.now() + offsetMs
}

/** Whether a chain-time sample has been observed yet. */
export function hasChainTime(): boolean {
  return sampled
}
