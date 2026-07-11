import { describe, expect, it } from 'vitest'
import { stroopsToXlm, xlmToStroops } from './amounts'

describe('xlmToStroops', () => {
  it('converts whole and fractional amounts', () => {
    expect(xlmToStroops('1')).toBe(10_000_000n)
    expect(xlmToStroops('12.5')).toBe(125_000_000n)
    expect(xlmToStroops('0.0000001')).toBe(1n)
  })

  it('accepts exactly 7 decimal places', () => {
    expect(xlmToStroops('1.2345678')).toBe(12_345_678n)
  })

  it('throws beyond 7 decimal places', () => {
    expect(() => xlmToStroops('1.23456789')).toThrow()
  })

  it('throws on malformed input', () => {
    expect(() => xlmToStroops('abc')).toThrow()
    expect(() => xlmToStroops('-1')).toThrow()
    expect(() => xlmToStroops('1.2.3')).toThrow()
  })
})

describe('stroopsToXlm', () => {
  it('formats whole and fractional amounts, trimming trailing zeros', () => {
    expect(stroopsToXlm(10_000_000n)).toBe('1')
    expect(stroopsToXlm(125_000_000n)).toBe('12.5')
    expect(stroopsToXlm(1n)).toBe('0.0000001')
  })

  it('handles negative amounts', () => {
    expect(stroopsToXlm(-125_000_000n)).toBe('-12.5')
  })

  it('round-trips with xlmToStroops', () => {
    for (const s of ['0.0000001', '1', '12.345678', '9999.9999999']) {
      expect(stroopsToXlm(xlmToStroops(s))).toBe(s)
    }
  })
})
