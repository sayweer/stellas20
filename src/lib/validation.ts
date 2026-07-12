/** Input validation for token amounts (>0, up to 7 decimals, within a balance). */
import { parseTokenAmount, stroopsToXlm } from './amounts'

/** On success the parsed stroop amount is returned so callers needn't re-parse. */
export type AmountResult = { ok: true; stroops: bigint } | { ok: false; reason: string }

/**
 * Validate a token amount against an available balance, comparing in stroops
 * (bigint) end-to-end so there is never a float/exact mismatch between what the
 * form accepts and what the contract receives.
 *
 * @param amount - Raw amount string from the form.
 * @param balanceStroops - The relevant token balance, in stroops.
 * @param opts.label - Token label used in the "exceeds your balance" message.
 * @returns `{ ok: true, stroops }`, or `{ ok: false, reason }`.
 */
export function isValidTokenAmount(
  amount: string,
  balanceStroops: bigint,
  opts: { label?: string } = {},
): AmountResult {
  const parsed = parseTokenAmount(amount)
  if (!parsed.ok) return parsed

  if (parsed.stroops > balanceStroops) {
    const label = opts.label ?? 'balance'
    return {
      ok: false,
      reason: `Amount exceeds your ${label} (${stroopsToXlm(balanceStroops)}).`,
    }
  }

  return { ok: true, stroops: parsed.stroops }
}
