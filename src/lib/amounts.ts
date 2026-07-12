/** XLM <-> stroop conversion. Pure string/bigint math — never `Number` for money. */

/** XLM has 7 decimal places on Stellar. */
const XLM_DECIMALS = 7
const STROOPS_PER_XLM = 10n ** BigInt(XLM_DECIMALS)

/**
 * Convert a human-entered XLM amount (e.g. "12.5") into stroops.
 * @param xlm - Plain decimal string, no sign or exponent, up to 7 decimals.
 * @throws if `xlm` isn't a well-formed non-negative decimal.
 */
export function xlmToStroops(xlm: string): bigint {
  const trimmed = xlm.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid XLM amount: "${xlm}"`)
  }
  const [wholeRaw, fracRaw = ''] = trimmed.split('.')
  if (fracRaw.length > XLM_DECIMALS) {
    throw new Error(`XLM amount has more than ${String(XLM_DECIMALS)} decimal places: "${xlm}"`)
  }
  const fracPadded = fracRaw.padEnd(XLM_DECIMALS, '0')
  return BigInt(wholeRaw) * STROOPS_PER_XLM + BigInt(fracPadded || '0')
}

/**
 * Parse and normalize a human-entered amount into stroops, tolerating the
 * shorthand forms a text input produces (`.5` → `0.5`, `1.` → `1`). This is
 * the single source of truth for "string → bigint" — callers must never hand
 * `xlmToStroops` raw input that might carry these forms.
 * @returns `{ ok, stroops }` on a valid positive amount (≤7 decimals), or
 *   `{ ok: false, reason }` with a user-facing reason.
 */
export function parseTokenAmount(
  input: string,
): { ok: true; stroops: bigint } | { ok: false; reason: string } {
  let trimmed = input.trim()
  if (trimmed === '') return { ok: false, reason: 'Enter an amount.' }
  if (trimmed.startsWith('.')) trimmed = `0${trimmed}`
  if (trimmed.endsWith('.')) trimmed = trimmed.slice(0, -1)
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return { ok: false, reason: 'Enter a valid number.' }

  const [whole, fracRaw = ''] = trimmed.split('.')
  if (fracRaw.length > XLM_DECIMALS) {
    return { ok: false, reason: 'Up to 7 decimal places are supported.' }
  }
  const stroops = BigInt(whole) * STROOPS_PER_XLM + BigInt(fracRaw.padEnd(XLM_DECIMALS, '0') || '0')
  if (stroops <= 0n) return { ok: false, reason: 'Amount must be greater than 0.' }
  return { ok: true, stroops }
}

/**
 * Convert a stroop amount into a plain XLM decimal string (trailing zeros
 * trimmed, at least "0" for the fractional part when non-integer).
 */
export function stroopsToXlm(stroops: bigint): string {
  const negative = stroops < 0n
  const abs = negative ? -stroops : stroops
  const whole = abs / STROOPS_PER_XLM
  const frac = (abs % STROOPS_PER_XLM).toString().padStart(XLM_DECIMALS, '0').replace(/0+$/, '')
  const sign = negative ? '-' : ''
  return frac === '' ? `${sign}${whole.toString()}` : `${sign}${whole.toString()}.${frac}`
}
