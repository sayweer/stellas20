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
