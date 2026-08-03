import { describe, expect, it } from 'vitest'
import { AssembledTransaction } from '@stellar/stellar-sdk/contract'
import {
  AMM_ERRORS,
  classifyContractError,
  MYT_ERRORS,
  SPLITTER_ERRORS,
  SY_ERRORS,
  wrapErrors,
} from './errors'

describe('classifyContractError', () => {
  it('maps a contract error code via the given table', () => {
    const err = new Error('...HostError: Error(Contract, #6)...')
    expect(classifyContractError(err, MYT_ERRORS).code).toBe('faucet_limit')
    // The same numeric code means something different per contract.
    expect(classifyContractError(err, SPLITTER_ERRORS).code).toBe('maturity_in_past')
    expect(classifyContractError(err, AMM_ERRORS).code).toBe('maturity_passed')
  })

  it('maps the AMM slippage and pool errors distinctly', () => {
    const slippage = new Error('Error(Contract, #8)')
    expect(classifyContractError(slippage, AMM_ERRORS).code).toBe('slippage_exceeded')
    const noPool = new Error('Error(Contract, #3)')
    expect(classifyContractError(noPool, AMM_ERRORS).code).toBe('pool_not_found')
  })

  it('detects a user-rejected signature', () => {
    const rejected = new AssembledTransaction.Errors.UserRejected('User declined the request')
    expect(classifyContractError(rejected, MYT_ERRORS).code).toBe('user_declined')
  })

  it('does not mistake an untyped post-submit rejection message for a wallet cancel', () => {
    expect(classifyContractError(new Error('Transaction rejected by RPC'), MYT_ERRORS).code).toBe(
      'contract_error',
    )
  })

  it('detects an unfunded source account', () => {
    const err = new Error('account not found: GABC...')
    expect(classifyContractError(err, MYT_ERRORS).code).toBe('account_unfunded')
  })

  it('tells an illiquid Blend pool apart from any other vault failure', () => {
    const illiquid = new Error('Error(Contract, #8)')
    const classified = classifyContractError(illiquid, SY_ERRORS)
    expect(classified.code).toBe('liquidity_unavailable')
    expect(classified.message).toContain('lent out')
    // A different pool failure must not borrow the liquidity wording.
    expect(classifyContractError(new Error('Error(Contract, #9)'), SY_ERRORS).code).toBe(
      'pool_rejected',
    )
  })

  it('names the active market’s asset when a wrap runs out of underlying', () => {
    const err = new Error('Error(Contract, #4)')
    expect(classifyContractError(err, wrapErrors('XLM')).message).toContain('XLM')
    expect(classifyContractError(err, wrapErrors('mUSDY')).message).toContain('mUSDY')
    // Outside a wrap the same code still means "not enough SY".
    expect(classifyContractError(err, SY_ERRORS).code).toBe('insufficient_balance')
  })

  it('falls back to a generic error for unknown codes', () => {
    const err = new Error('Error(Contract, #999)')
    expect(classifyContractError(err, MYT_ERRORS).code).toBe('contract_error')
  })

  /**
   * These were the most frequent thing in Sentry, reported as defects while
   * telling us nothing: not reaching the RPC is routine on a phone and under
   * Testnet load, and retrying is the whole remedy. Each engine words it
   * differently, so all three spellings have to land on the same result.
   */
  it.each([
    ['Failed to fetch', 'Chrome'],
    ['Load failed', 'Safari'],
    ['Network Error', 'axios'],
  ])('treats %s (%s) as a reachability problem, not a failed transaction', (message) => {
    const classified = classifyContractError(new Error(message), SPLITTER_ERRORS)
    expect(classified.code).toBe('network_error')
    expect(classified.message).toMatch(/connection/i)
  })

  it('still prefers a contract code over the network wording', () => {
    // A contract failure whose text happens to mention fetching must not be
    // demoted to "check your connection".
    const err = new Error('Error(Contract, #11) while fetching')
    expect(classifyContractError(err, SPLITTER_ERRORS).code).toBe('nothing_to_claim')
  })
})

/**
 * Guards against the failure this file was found in: two error variants added
 * to the contracts during audit rounds (SplitterError::InvalidSymbol and
 * AmmError::SyTokenMismatch) were never mirrored here, so they fell through to
 * the generic "transaction failed" message. Any new variant must extend the
 * table — these assert the highest code each contract currently defines.
 */
describe('error tables track the contracts', () => {
  it('covers every SplitterError variant (1..14)', () => {
    for (let code = 1; code <= 14; code++) {
      expect(SPLITTER_ERRORS[code], `SplitterError #${String(code)}`).toBeDefined()
    }
  })

  it('covers every AmmError variant (1..12)', () => {
    for (let code = 1; code <= 12; code++) {
      expect(AMM_ERRORS[code], `AmmError #${String(code)}`).toBeDefined()
    }
  })

  it('covers every SyError variant (1..7) plus the Blend-only codes', () => {
    for (let code = 1; code <= 10; code++) {
      expect(SY_ERRORS[code], `SyError #${String(code)}`).toBeDefined()
    }
  })

  it('covers every TokenError variant (1..9)', () => {
    for (let code = 1; code <= 9; code++) {
      expect(MYT_ERRORS[code], `TokenError #${String(code)}`).toBeDefined()
    }
  })
})
