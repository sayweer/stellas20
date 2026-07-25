import { nativeToScVal } from '@stellar/stellar-sdk'
import type { Api } from '@stellar/stellar-sdk/rpc'
import { describe, expect, it } from 'vitest'
import { parseEvent } from './events'

const ADDR = 'GDPC4DFVPY2NPQ2GDPE7D3YCQ5NZ34S4PCC2MZALFC4JHZXCVCAQVNKA'

/** Build a minimal RPC event fixture from a topic symbol, actor, and data map. */
function makeEvent(
  topic0: string,
  actor: string | null,
  data: Record<string, bigint | boolean>,
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

  it('reads the wrap amount from either vault’s event shape', () => {
    // The mock vault wraps 1:1 and emits one amount...
    expect(parseEvent(makeEvent('wrap', ADDR, { amount: 50_0000000n }))?.amount).toBe(50_0000000n)
    // ...the Blend vault mints bTokens, so it reports both legs; the feed shows
    // what the user put in.
    const blend = parseEvent(makeEvent('wrap', ADDR, { asset_in: 100_0000000n, sy_out: 61_9870358n }))
    expect(blend?.amount).toBe(100_0000000n)
    const unwrap = parseEvent(makeEvent('unwrap', ADDR, { sy_in: 10_0000000n, asset_out: 16_1334598n }))
    expect(unwrap?.amount).toBe(10_0000000n)
  })

  it('parses a swap, choosing the output unit from the direction', () => {
    // pt_in=false: SY went in, PT came out — the payout unit is PT.
    const buyPt = parseEvent(
      makeEvent('swap', ADDR, { amount_in: 1_0000000n, amount_out: 995_000n, pt_in: false }),
    )
    expect(buyPt?.type).toBe('swap')
    expect(buyPt?.amount).toBe(995_000n)
    expect(buyPt?.unit).toBe('PT')
    // pt_in=true: PT went in, SY came out.
    const sellPt = parseEvent(
      makeEvent('swap', ADDR, { amount_in: 1_0000000n, amount_out: 990_000n, pt_in: true }),
    )
    expect(sellPt?.unit).toBe('SY')
  })

  it('parses liquidity events using the SY leg', () => {
    const add = parseEvent(makeEvent('liquidity_added', ADDR, { sy_in: 40_0000000n, lp_minted: 6n }))
    expect(add?.type).toBe('liquidity_added')
    expect(add?.amount).toBe(40_0000000n)
    const rem = parseEvent(makeEvent('liquidity_removed', ADDR, { sy_out: 4_0000000n, lp_burned: 6n }))
    expect(rem?.amount).toBe(4_0000000n)
  })

  it('returns null for an unrelated event topic', () => {
    expect(parseEvent(makeEvent('transfer', ADDR, { amount: 1n }))).toBeNull()
  })
})
