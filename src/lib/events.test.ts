import { nativeToScVal } from '@stellar/stellar-sdk'
import type { Api } from '@stellar/stellar-sdk/rpc'
import { describe, expect, it } from 'vitest'
import { parseEvent } from './events'

const ADDR = 'GDPC4DFVPY2NPQ2GDPE7D3YCQ5NZ34S4PCC2MZALFC4JHZXCVCAQVNKA'

/** Build a minimal RPC event fixture from a topic symbol, actor, and data map. */
function makeEvent(
  topic0: string,
  actor: string | null,
  data: Record<string, bigint>,
): Api.EventResponse {
  const topic = [nativeToScVal(topic0, { type: 'symbol' })]
  if (actor) topic.push(nativeToScVal(actor, { type: 'address' }))
  return {
    id: '000123-1',
    type: 'contract',
    ledger: 42,
    ledgerClosedAt: '2026-07-11T00:00:00Z',
    contractId: 'CA2ENFLBAFF2F4PFPLUR5M5CUYIFXCLMCO4AYWA6AP3BZ4FSLBENYQNS',
    txHash: 'abc123',
    topic,
    value: nativeToScVal(data),
  } as unknown as Api.EventResponse
}

describe('parseEvent', () => {
  it('parses a split event into its fields', () => {
    const parsed = parseEvent(makeEvent('split', ADDR, { sy_in: 300_0000000n, pt_out: 306_0000000n }))
    expect(parsed).not.toBeNull()
    expect(parsed?.type).toBe('split')
    expect(parsed?.address).toBe(ADDR)
    // Split shows the SY that went in.
    expect(parsed?.amount).toBe(300_0000000n)
    expect(parsed?.txHash).toBe('abc123')
  })

  it('parses a faucet event using the amount field', () => {
    const parsed = parseEvent(makeEvent('faucet', ADDR, { amount: 1_000_0000000n }))
    expect(parsed?.type).toBe('faucet')
    expect(parsed?.amount).toBe(1_000_0000000n)
  })

  it('returns null for an unrelated event topic', () => {
    expect(parseEvent(makeEvent('transfer', ADDR, { amount: 1n }))).toBeNull()
  })
})
