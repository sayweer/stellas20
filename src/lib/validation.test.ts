import { describe, expect, it } from 'vitest'
import { isValidTokenAmount } from './validation'

const BAL = 100_0000000n // 100 tokens, in stroops

describe('isValidTokenAmount', () => {
  it('rejects an empty or blank amount', () => {
    expect(isValidTokenAmount('', BAL).ok).toBe(false)
    expect(isValidTokenAmount('   ', BAL).ok).toBe(false)
  })

  it('rejects non-numeric input', () => {
    expect(isValidTokenAmount('abc', BAL).ok).toBe(false)
    expect(isValidTokenAmount('1.2.3', BAL).ok).toBe(false)
    expect(isValidTokenAmount('-5', BAL).ok).toBe(false)
  })

  it('rejects zero', () => {
    expect(isValidTokenAmount('0', BAL).ok).toBe(false)
    expect(isValidTokenAmount('0.0', BAL).ok).toBe(false)
  })

  it('rejects more than 7 decimal places', () => {
    expect(isValidTokenAmount('1.12345678', BAL).ok).toBe(false)
    expect(isValidTokenAmount('1.1234567', BAL).ok).toBe(true)
  })

  it('rejects amounts above the balance', () => {
    const result = isValidTokenAmount('101', BAL, { label: 'SY' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('SY')
  })

  it('accepts a valid amount within the balance and returns stroops', () => {
    const exact = isValidTokenAmount('100', BAL)
    expect(exact).toEqual({ ok: true, stroops: 100_0000000n })
    const half = isValidTokenAmount('42.5', BAL)
    expect(half).toEqual({ ok: true, stroops: 42_5000000n })
  })

  it('exact-balance boundary in stroops (no float slop)', () => {
    expect(isValidTokenAmount('0.0000001', 1n).ok).toBe(true) // exactly 1 stroop
    expect(isValidTokenAmount('0.0000002', 1n).ok).toBe(false) // 2 stroops > 1
  })
})
