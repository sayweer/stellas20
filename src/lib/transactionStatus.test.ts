import { Api } from '@stellar/stellar-sdk/rpc'
import { describe, expect, it } from 'vitest'
import { interpretTransactionStatus } from './transactionStatus'

describe('transaction finality status', () => {
  it.each([
    [Api.GetTransactionStatus.SUCCESS, 'success'],
    [Api.GetTransactionStatus.FAILED, 'failed'],
    [Api.GetTransactionStatus.NOT_FOUND, 'not_found'],
  ])('maps %s without unlocking an ambiguous state', (status, expected) => {
    expect(interpretTransactionStatus(status)).toBe(expected)
  })

  it('keeps unknown RPC states fail-closed', () => {
    expect(interpretTransactionStatus('SOMETHING_NEW')).toMatchObject({
      code: 'transaction_status_unknown',
    })
  })
})
