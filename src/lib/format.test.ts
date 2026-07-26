import { describe, expect, it } from 'vitest'
import { formatAmount, formatRelativeTime, truncateAddress } from './format'

const UNIT = 10_000_000n // one token, in stroops

describe('formatAmount', () => {
  it('groups thousands and trims trailing zeros', () => {
    expect(formatAmount(1_234_567n * UNIT)).toBe('1,234,567')
    expect(formatAmount(UNIT / 2n)).toBe('0.5')
    expect(formatAmount(0n)).toBe('0')
  })

  it('keeps at most maxDecimals places', () => {
    // 1.23456789 tokens -> 4 dp by default, 6 on request
    expect(formatAmount(12_345_678n)).toBe('1.2345')
    expect(formatAmount(12_345_678n, 6)).toBe('1.234567')
  })

  it('signs negative amounts', () => {
    expect(formatAmount(-3n * UNIT)).toBe('-3')
    expect(formatAmount(-UNIT / 4n)).toBe('-0.25')
  })

  it('stays exact above 2^53', () => {
    // The integer part here is 9007199254740993456, past the point a double can
    // represent consecutive integers; formatting used to rewrite the low digits.
    const stroops = 9_007_199_254_740_993_456n * UNIT
    expect(formatAmount(stroops)).toBe('9,007,199,254,740,993,456')
  })
})

describe('truncateAddress', () => {
  it('keeps the first and last four characters', () => {
    expect(truncateAddress('GDOC1234567890ABCDEFDTNC')).toBe('GDOC…DTNC')
  })
})

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-07-26T12:00:00Z')
  const ago = (ms: number): string => new Date(now - ms).toISOString()

  it('describes recent times in the largest whole unit', () => {
    expect(formatRelativeTime(ago(5_000), now)).toBe('just now')
    expect(formatRelativeTime(ago(5 * 60_000), now)).toBe('5m ago')
    expect(formatRelativeTime(ago(3 * 3_600_000), now)).toBe('3h ago')
    expect(formatRelativeTime(ago(2 * 86_400_000), now)).toBe('2d ago')
  })

  it('never reports a future timestamp as negative', () => {
    expect(formatRelativeTime(new Date(now + 60_000).toISOString(), now)).toBe('just now')
  })
})
