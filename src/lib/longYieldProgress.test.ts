import { describe, expect, it } from 'vitest'
import { parseLongYieldProgressStore, resolveLongYieldRecovery } from './longYieldProgress'

describe('long-yield recovery records', () => {
  it('restores only exact, bigint-safe progress records', () => {
    const valid = {
      version: 1,
      id: 'flow-a',
      address: 'GABC',
      marketKey: 'musdy',
      maturity: '1770000000',
      ptOut: '12345678901234567890',
      syIn: '10000000',
      source: 'split',
      updatedAt: 42,
    }
    expect(parseLongYieldProgressStore(JSON.stringify({ scope: valid }))).toEqual({ scope: valid })
  })

  it.each([
    null,
    '{bad json',
    JSON.stringify({ scope: { version: 1, ptOut: '-1' } }),
    JSON.stringify({ scope: { version: 1, ptOut: 123 } }),
  ])('drops malformed progress without inventing a sell amount', (raw) => {
    expect(parseLongYieldProgressStore(raw)).toEqual({})
  })

  it('resumes only the exact saved PT output', () => {
    const progress = {
      version: 1 as const,
      id: 'flow-a',
      address: 'GABC',
      marketKey: 'musdy',
      maturity: '1770000000',
      ptOut: '5000000',
      syIn: '6000000',
      source: 'split' as const,
      updatedAt: 42,
    }
    expect(resolveLongYieldRecovery(progress, 8_000_000n)).toEqual({
      kind: 'resume_saved',
      ptOut: 5_000_000n,
      syIn: 6_000_000n,
    })
    expect(resolveLongYieldRecovery(progress, 4_000_000n)).toEqual({
      kind: 'choose_existing',
    })
  })

  it('requires a choice for unsaved PT and otherwise permits a fresh split', () => {
    expect(resolveLongYieldRecovery(null, 1n)).toEqual({ kind: 'choose_existing' })
    expect(resolveLongYieldRecovery(null, 0n)).toEqual({ kind: 'new_split' })
  })
})
