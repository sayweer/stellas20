/** Input validation: destination address (StrKey) and payment amount (>0, within balance + fee headroom). */
import { StrKey } from '@stellar/stellar-sdk'

/** XLM kept in reserve to cover the network fee + base reserve (per CLAUDE.md). */
const FEE_RESERVE_HEADROOM_XLM = 1.5

/** Maximum number of decimal places a Stellar (XLM) amount may have. */
const MAX_DECIMALS = 7

/**
 * Whether `addr` is a well-formed Stellar ed25519 public key (G...).
 * @param addr - Candidate address (whitespace is trimmed).
 */
export function isValidStellarAddress(addr: string): boolean {
  return StrKey.isValidEd25519PublicKey(addr.trim())
}

/**
 * Validate a human-entered XLM amount against the spendable balance. Requires a
 * positive decimal with at most 7 places that still leaves ~1.5 XLM under `max`
 * for the network fee and base reserve.
 *
 * @param amount - Raw amount string from the form.
 * @param max - Current account balance in XLM.
 * @returns `{ ok: true }`, or `{ ok: false, reason }` with a user-facing reason.
 */
export function isValidAmount(amount: string, max: number): { ok: boolean; reason?: string } {
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

  const spendable = max - FEE_RESERVE_HEADROOM_XLM
  if (!Number.isFinite(spendable) || spendable <= 0) {
    return {
      ok: false,
      reason: `Balance too low — keep ~${FEE_RESERVE_HEADROOM_XLM} XLM for the fee and base reserve.`,
    }
  }
  if (value > spendable) {
    return {
      ok: false,
      reason: `Amount exceeds your spendable balance (~${spendable.toFixed(MAX_DECIMALS)} XLM after fee + reserve).`,
    }
  }

  return { ok: true }
}
