import { describe, expect, it } from 'vitest'
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
    expect(classifyContractError(new Error('User declined the request'), MYT_ERRORS).code).toBe(
      'user_declined',
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
