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
    message: 'The faucet is capped at 10,000 tokens per request.',
  },
  7: { code: 'unauthorized', message: 'Only the admin can do that.' },
  8: { code: 'math_overflow', message: 'That amount is too large to process.' },
  9: { code: 'allowance_expired', message: 'That allowance has expired.' },
}

/**
 * SYVault (`SyError`) — and the Blend-backed vault, whose `SyBlendError` keeps
 * codes 1–7 identical on purpose so this table is shared. 8–10 only ever come
 * from the Blend vault; on the mock vault they are unreachable.
 */
export const SY_ERRORS: ErrorTable = {
  1: { code: 'already_initialized', message: 'The vault is already initialized.' },
  2: { code: 'not_initialized', message: 'The vault has not been initialized yet.' },
  3: { code: 'invalid_amount', message: 'Enter an amount greater than 0.' },
  4: { code: 'insufficient_balance', message: 'That exceeds your SY balance.' },
  5: { code: 'math_overflow', message: 'That amount is too large to process.' },
  6: { code: 'insufficient_allowance', message: 'The spender allowance is too low.' },
  7: { code: 'allowance_expired', message: 'That allowance has expired.' },
  8: {
    code: 'liquidity_unavailable',
    message:
      'The Blend pool has no free liquidity right now — everything is lent out. Try a smaller amount or come back shortly.',
  },
  9: { code: 'pool_rejected', message: 'The Blend pool rejected this request.' },
  10: { code: 'invalid_rate', message: 'The Blend pool reported an unusable exchange rate.' },
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
  14: { code: 'invalid_symbol', message: 'That underlying ticker is not a valid token symbol.' },
}

/** PT-AMM (`AmmError`). */
export const AMM_ERRORS: ErrorTable = {
  1: { code: 'not_initialized', message: 'The AMM has not been initialized yet.' },
  2: { code: 'invalid_amount', message: 'Enter an amount greater than 0.' },
  3: { code: 'pool_not_found', message: 'There is no pool for that maturity yet.' },
  4: { code: 'pool_exists', message: 'That pool already exists.' },
  5: { code: 'maturity_not_found', message: 'That maturity does not exist.' },
  6: { code: 'maturity_passed', message: 'This maturity has passed — trading is closed.' },
  7: { code: 'insufficient_liquidity', message: 'The pool is too shallow for that trade.' },
  8: {
    code: 'slippage_exceeded',
    message: 'The price moved beyond your slippage limit. Try again.',
  },
  9: { code: 'insufficient_lp', message: 'That exceeds your pool share.' },
  10: { code: 'math_overflow', message: 'That amount is too large to process.' },
  11: { code: 'unauthorized', message: 'Only the admin can do that.' },
  12: {
    code: 'sy_token_mismatch',
    message: 'This AMM is wired to a different SY token than the market it points at.',
  },
}

/**
 * Splitter write paths (split/merge/claim/redeem) call SYVault.transfer, so a
 * failed sub-call can surface a `SyError` code where a `SplitterError` code is
 * expected — the numeric spaces overlap. In these paths the maturity is always
 * one the user selected and there is no un-create, so SplitterError #4
 * (MaturityNotFound) and #5 (MaturityExists) are unreachable; a #4/#5 therefore
 * comes from SYVault. Resolve those two to their SY meaning so an insufficient-SY
 * failure reads correctly instead of "that maturity does not exist".
 */
export const SPLITTER_WRITE_ERRORS: ErrorTable = {
  ...SPLITTER_ERRORS,
  // SyError::InsufficientBalance (via SYVault.transfer), not SplitterError::MaturityNotFound.
  4: { code: 'insufficient_sy', message: 'That exceeds your SY balance.' },
  // SyError::MathOverflow, not SplitterError::MaturityExists.
  5: { code: 'math_overflow', message: 'That amount is too large to process.' },
}

/**
 * Wrapping pulls the underlying through its own token contract, so an
 * insufficient-underlying failure surfaces as that token's
 * `InsufficientBalance` #4. Wrap mints SY (never debits it), so SyError #4 is
 * unreachable here — a #4 means not enough of the underlying, not of SY. The
 * message names the active market's asset, so "not enough XLM" never reads as
 * "not enough mUSDY".
 */
export function wrapErrors(underlyingSymbol: string): ErrorTable {
  return {
    ...SY_ERRORS,
    4: {
      code: 'insufficient_underlying',
      message: `You don’t have enough ${underlyingSymbol} for that.`,
    },
  }
}
