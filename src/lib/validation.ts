/** Input validation: deposit/withdraw amount (>0, within a given balance). */

/** XLM kept in reserve to cover the network fee + base reserve (per CLAUDE.md). */
const FEE_RESERVE_HEADROOM_XLM = 1.5

/** Maximum number of decimal places a Stellar (XLM) amount may have. */
const MAX_DECIMALS = 7

type AmountResult = { ok: true } | { ok: false; reason: string }

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
    return { ok: false, reason: 'XLM supports up to 7 decimal places.' }
  }

  return { ok: true, value }
}

/**
 * Validate a deposit amount against the wallet's XLM balance. Requires a
 * positive decimal with at most 7 places that still leaves ~1.5 XLM under
 * `walletBalance` for the network fee and base reserve.
 *
 * @param amount - Raw amount string from the form.
 * @param walletBalance - Connected wallet's current XLM balance.
 * @returns `{ ok: true }`, or `{ ok: false, reason }` with a user-facing reason.
 */
export function isValidDepositAmount(amount: string, walletBalance: number): AmountResult {
  const parsed = parseAmount(amount)
  if (!parsed.ok) return parsed

  const spendable = walletBalance - FEE_RESERVE_HEADROOM_XLM
  if (!Number.isFinite(spendable) || spendable <= 0) {
    return {
      ok: false,
      reason: `Balance too low — keep ~${FEE_RESERVE_HEADROOM_XLM.toString()} XLM for the fee and base reserve.`,
    }
  }
  if (parsed.value > spendable) {
    return {
      ok: false,
      reason: `Amount exceeds your spendable balance (~${spendable.toFixed(MAX_DECIMALS)} XLM after fee + reserve).`,
    }
  }

  return { ok: true }
}

/**
 * Validate a withdraw amount against the caller's own recorded vault balance
 * (no fee headroom — that only applies to the wallet's XLM balance).
 *
 * @param amount - Raw amount string from the form.
 * @param vaultBalance - The caller's own balance recorded in the vault.
 * @returns `{ ok: true }`, or `{ ok: false, reason }` with a user-facing reason.
 */
export function isValidWithdrawAmount(amount: string, vaultBalance: number): AmountResult {
  const parsed = parseAmount(amount)
  if (!parsed.ok) return parsed

  if (parsed.value > vaultBalance) {
    return {
      ok: false,
      reason: `You've only deposited ${vaultBalance.toFixed(MAX_DECIMALS)} XLM in the vault.`,
    }
  }

  return { ok: true }
}
