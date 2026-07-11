import { describe, expect, it } from 'vitest'
import { isValidTokenAmount } from './validation'

describe('isValidTokenAmount', () => {
  it('rejects an empty or blank amount', () => {
    expect(isValidTokenAmount('', 100)).toEqual({ ok: false, reason: expect.any(String) })
    expect(isValidTokenAmount('   ', 100)).toEqual({ ok: false, reason: expect.any(String) })
  })

  it('rejects non-numeric input', () => {
    expect(isValidTokenAmount('abc', 100).ok).toBe(false)
    expect(isValidTokenAmount('1.2.3', 100).ok).toBe(false)
    expect(isValidTokenAmount('-5', 100).ok).toBe(false)
  })

  it('rejects zero', () => {
    expect(isValidTokenAmount('0', 100).ok).toBe(false)
    expect(isValidTokenAmount('0.0', 100).ok).toBe(false)
  })

  it('rejects more than 7 decimal places', () => {
    expect(isValidTokenAmount('1.12345678', 100).ok).toBe(false)
    expect(isValidTokenAmount('1.1234567', 100).ok).toBe(true)
  })

  it('rejects amounts above the balance', () => {
    const result = isValidTokenAmount('101', 100, { label: 'SY' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('SY')
  })

  it('accepts a valid amount within the balance', () => {
    expect(isValidTokenAmount('100', 100)).toEqual({ ok: true })
    expect(isValidTokenAmount('42.5', 100)).toEqual({ ok: true })
  })
})
