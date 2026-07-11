/**
 * Per-contract error tables plus the classifier that maps a thrown pipeline
 * error to a friendly {@link AppError}. Kept free of any wallet dependency so
 * it can be unit-tested in a plain node environment; the per-contract tables
 * disambiguate the overlapping numeric codes across contracts.
 */
import { AssembledTransaction } from '@stellar/stellar-sdk/contract'
import type { AppError } from '../../types'

/** A per-contract error-code → friendly-message table. */
export type ErrorTable = Record<number, AppError>

/** Contract errors surface as `Error(Contract, #N)` in the thrown message. */
const CONTRACT_ERROR_PATTERN = /Error\(Contract, #(\d+)\)/

/**
 * Map a thrown error from the contract pipeline into a friendly AppError,
 * using the caller's per-contract `errorTable` for `Error(Contract, #N)`.
 */
export function classifyContractError(e: unknown, errorTable: ErrorTable): AppError {
  const message = e instanceof Error ? e.message : String(e)

  const match = CONTRACT_ERROR_PATTERN.exec(message)
  if (match) {
    const known = errorTable[Number(match[1])]
    if (known) return known
  }
  if (e instanceof AssembledTransaction.Errors.UserRejected || /declin|reject|cancel/i.test(message)) {
    return { code: 'user_declined', message: 'You cancelled the transaction.' }
  }
  if (/account.*not.*found|not.*exist/i.test(message)) {
    return {
      code: 'account_unfunded',
      message: 'Your account is not funded yet. Fund it with Friendbot and try again.',
    }
  }
  return { code: 'contract_error', message: 'The transaction failed. Please try again.' }
}

/** MockYieldToken (`TokenError`). */
export const MYT_ERRORS: ErrorTable = {
  1: { code: 'already_initialized', message: 'The token is already initialized.' },
  2: { code: 'not_initialized', message: 'The token has not been initialized yet.' },
  3: { code: 'invalid_amount', message: 'Enter an amount greater than 0.' },
  4: { code: 'insufficient_balance', message: 'You don’t have enough tokens for that.' },
  5: { code: 'insufficient_allowance', message: 'The spender allowance is too low.' },
  6: {
    code: 'faucet_limit',
    message: 'The faucet is capped at 10,000 mUSDY per request.',
  },
  7: { code: 'unauthorized', message: 'Only the admin can do that.' },
  8: { code: 'math_overflow', message: 'That amount is too large to process.' },
  9: { code: 'allowance_expired', message: 'That allowance has expired.' },
}

/** SYVault (`SyError`). */
export const SY_ERRORS: ErrorTable = {
  1: { code: 'already_initialized', message: 'The vault is already initialized.' },
  2: { code: 'not_initialized', message: 'The vault has not been initialized yet.' },
  3: { code: 'invalid_amount', message: 'Enter an amount greater than 0.' },
  4: { code: 'insufficient_balance', message: 'That exceeds your SY balance.' },
  5: { code: 'math_overflow', message: 'That amount is too large to process.' },
}

/** Splitter (`SplitterError`). */
export const SPLITTER_ERRORS: ErrorTable = {
  1: { code: 'already_initialized', message: 'The market is already initialized.' },
  2: { code: 'not_initialized', message: 'The market has not been initialized yet.' },
  3: { code: 'invalid_amount', message: 'Enter an amount greater than 0.' },
  4: { code: 'maturity_not_found', message: 'That maturity does not exist.' },
  5: { code: 'maturity_exists', message: 'That maturity already exists.' },
  6: { code: 'maturity_in_past', message: 'A maturity must be in the future.' },
  7: { code: 'maturity_passed', message: 'This maturity has passed — split and merge are closed.' },
  8: {
    code: 'maturity_not_reached',
    message: 'You can only redeem principal at or after maturity.',
  },
  9: { code: 'insufficient_pt', message: 'That exceeds your PT balance.' },
  10: { code: 'insufficient_yt', message: 'That exceeds your YT balance.' },
  11: { code: 'nothing_to_claim', message: 'There is no yield to claim yet.' },
  12: { code: 'unauthorized', message: 'Only the admin can do that.' },
  13: { code: 'math_overflow', message: 'That amount is too large to process.' },
}
