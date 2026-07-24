import { describe, expect, it } from 'vitest'
import { AMM_ERRORS, classifyContractError, MYT_ERRORS, SPLITTER_ERRORS } from './errors'

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

  it('falls back to a generic error for unknown codes', () => {
    const err = new Error('Error(Contract, #999)')
    expect(classifyContractError(err, MYT_ERRORS).code).toBe('contract_error')
  })
})
