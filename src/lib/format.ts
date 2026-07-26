/** Display formatting helpers for token amounts and addresses. */
import { stroopsToXlm } from './amounts'

/**
 * Format a stroop amount as a grouped decimal string for display, keeping at
 * most `maxDecimals` places (trailing zeros trimmed). Uses the exact bigint
 * conversion, so no precision is lost before the final truncation.
 */
export function formatAmount(stroops: bigint, maxDecimals = 4): string {
  const [intPart = '0', fracRaw = ''] = stroopsToXlm(stroops < 0n ? -stroops : stroops).split('.')
  const sign = stroops < 0n ? '-' : ''
  const grouped = groupDigits(intPart)
  const frac = fracRaw.slice(0, maxDecimals).replace(/0+$/, '')
  return frac ? `${sign}${grouped}.${frac}` : `${sign}${grouped}`
}

/**
 * Insert thousands separators into a decimal integer *string*.
 *
 * Amounts are i128 on chain, so the integer part can exceed 2^53. Going through
 * `Number(...).toLocaleString()` silently rewrote the low digits of anything
 * larger — 9007199254740993456 displayed as ...993,000 — which contradicted
 * this module's own promise that the bigint conversion loses no precision.
 */
function groupDigits(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** Shorten a Stellar address/contract id for compact display. */
export function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}

/** Format a unix-seconds maturity as a short local date-time. */
export function formatMaturity(maturity: bigint): string {
  const date = new Date(Number(maturity) * 1000)
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Compact relative time (e.g. "just now", "5m ago", "3h ago"). */
export function formatRelativeTime(iso: string, nowMs = Date.now()): string {
  const seconds = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes.toString()}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours.toString()}h ago`
  return `${Math.floor(hours / 24).toString()}d ago`
}
