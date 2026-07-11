/** Input validation for token amounts (>0, up to 7 decimals, within a balance). */

/** Maximum number of decimal places a Stellar-style (7-decimal) amount may have. */
const MAX_DECIMALS = 7

export type AmountResult = { ok: true } | { ok: false; reason: string }

/** Parse and range-check a raw amount string, with no balance ceiling applied yet. */
function parseAmount(amount: string): { ok: true; value: number } | { ok: false; reason: string } {
  const trimmed = amount.trim()
  if (trimmed === '') {
    return { ok: false, reason: 'Enter an amount.' }
  }
  // Plain decimal only: digits with an optional single decimal point. No sign, no exponent.
  if (!/^\d*\.?\d+$/.test(trimmed)) {
    return { ok: false, reason: 'Enter a valid number.' }
  }

  const value = Number(trimmed)
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, reason: 'Amount must be greater than 0.' }
  }

  const dotIndex = trimmed.indexOf('.')
  const decimals = dotIndex === -1 ? 0 : trimmed.length - dotIndex - 1
  if (decimals > MAX_DECIMALS) {
    return { ok: false, reason: 'Up to 7 decimal places are supported.' }
  }

  return { ok: true, value }
}

/**
 * Validate a token amount: a positive decimal with at most 7 places, no more
 * than the available `balance`.
 *
 * @param amount - Raw amount string from the form.
 * @param balance - The relevant token balance (same units as `amount`).
 * @param opts.label - Token label used in the "exceeds your balance" message.
 * @returns `{ ok: true }`, or `{ ok: false, reason }` with a user-facing reason.
 */
export function isValidTokenAmount(
  amount: string,
  balance: number,
  opts: { label?: string } = {},
): AmountResult {
  const parsed = parseAmount(amount)
  if (!parsed.ok) return parsed

  if (parsed.value > balance) {
    const label = opts.label ?? 'balance'
    return {
      ok: false,
      reason: `Amount exceeds your ${label} (${balance.toLocaleString('en-US', {
        maximumFractionDigits: MAX_DECIMALS,
      })}).`,
    }
  }

  return { ok: true }
}
