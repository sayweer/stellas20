/**
 * Pure client-side math mirroring the contracts, for live estimates the UI
 * can compute without an RPC round-trip. All money math is bigint; only final
 * display conversions touch `Number`.
 */

/** Exchange-rate fixed-point scale (must match the contracts' `RATE_SCALE`). */
export const RATE_SCALE = 1_000_000_000_000n

/** A rate checkpoint: `rate` at `since`, growing by `slopePerSec` each second. */
export interface RateCheckpoint {
  since: bigint
  rate: bigint
  slopePerSec: bigint
}

/** The reserve-accounting fields a claimable estimate needs. */
export interface PositionLike {
  yt: bigint
  reserveSy: bigint
  accruedSy: bigint
}

/** `ceil(a / b)` for non-negative `a` and positive `b`. */
export function ceilDiv(a: bigint, b: bigint): bigint {
  if (a <= 0n) return 0n
  return (a + b - 1n) / b
}

/** Exchange rate at unix time `ts` (seconds), clamped to `since`. */
export function rateAt(cp: RateCheckpoint, ts: bigint): bigint {
  const elapsed = ts > cp.since ? ts - cp.since : 0n
  return cp.rate + cp.slopePerSec * elapsed
}

/**
 * SY a position could claim at exchange rate `rate`, mirroring the contract's
 * settle: `accrued + max(0, reserve - ceil(yt * SCALE / rate))`.
 */
export function projectedClaimable(pos: PositionLike, rate: bigint): bigint {
  if (pos.yt <= 0n || rate <= 0n) return pos.accruedSy
  const needed = ceilDiv(pos.yt * RATE_SCALE, rate)
  const released = pos.reserveSy > needed ? pos.reserveSy - needed : 0n
  return pos.accruedSy + released
}

/** A rate as a human decimal (e.g. 1_200_000_000_000n -> 1.2). */
export function rateToDecimal(rate: bigint): number {
  return Number(rate) / Number(RATE_SCALE)
}

/** Approximate yield rate as a percent-per-minute number (for a ticker label). */
export function ratePerMinutePct(slopePerSec: bigint): number {
  return (Number(slopePerSec) / Number(RATE_SCALE)) * 60 * 100
}

/** A maturity countdown broken down for display, or `matured: true`. */
export interface Countdown {
  matured: boolean
  days: number
  hours: number
  minutes: number
  seconds: number
}

/**
 * Time left until `maturitySec` (unix seconds) given `nowMs` (ms). Returns
 * `matured: true` once reached.
 */
export function maturityCountdown(maturitySec: bigint, nowMs: number): Countdown {
  const remainingMs = Number(maturitySec) * 1000 - nowMs
  if (remainingMs <= 0) {
    return { matured: true, days: 0, hours: 0, minutes: 0, seconds: 0 }
  }
  const total = Math.floor(remainingMs / 1000)
  return {
    matured: false,
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}
