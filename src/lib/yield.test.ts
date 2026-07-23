import { describe, expect, it } from 'vitest'
import {
  ceilDiv,
  claimableAt,
  maturityCountdown,
  projectedClaimable,
  ratePerMinutePct,
  rateAt,
  RATE_SCALE,
} from './yield'

describe('ceilDiv', () => {
  it('rounds up on a remainder and is exact when divisible', () => {
    expect(ceilDiv(10n, 3n)).toBe(4n)
    expect(ceilDiv(9n, 3n)).toBe(3n)
    expect(ceilDiv(1n, 1_000_000n)).toBe(1n)
    expect(ceilDiv(0n, 5n)).toBe(0n)
  })
})

describe('rateAt', () => {
  it('grows linearly and clamps before the checkpoint', () => {
    const cp = { since: 1000n, rate: RATE_SCALE, slopePerSec: 200_000_000n }
    expect(rateAt(cp, 1000n)).toBe(RATE_SCALE)
    expect(rateAt(cp, 1060n)).toBe(RATE_SCALE + 60n * 200_000_000n)
    // Before `since`, elapsed clamps to 0.
    expect(rateAt(cp, 500n)).toBe(RATE_SCALE)
  })
})

describe('projectedClaimable', () => {
  it('mirrors the contract: accrued + floor(yt·S/index) − ceil(yt·S/rate)', () => {
    // yt = 100 (1e9 stroops), settled at index 1.0, now valued at rate 1.2.
    const pos = { yt: 1_000_000_000n, index: RATE_SCALE, accruedSy: 0n }
    const rate = 1_200_000_000_000n
    // entitled = floor(1e9·1e12/1e12) = 1e9;
    // needed = ceil(1e9·1e12/1.2e12) = 833_333_334; released = 166_666_666.
    expect(projectedClaimable(pos, rate)).toBe(166_666_666n)
  })

  it('returns just the accrued amount when there is no YT', () => {
    expect(projectedClaimable({ yt: 0n, index: 0n, accruedSy: 42n }, RATE_SCALE)).toBe(42n)
  })

  it('returns just the accrued amount for an untouched (index 0) position', () => {
    expect(projectedClaimable({ yt: 1_000_000_000n, index: 0n, accruedSy: 7n }, RATE_SCALE)).toBe(
      7n,
    )
  })
})

describe('claimableAt', () => {
  const cp = { since: 0n, rate: RATE_SCALE, slopePerSec: 200_000_000n }
  const pos = { yt: 1_000_000_000n, index: RATE_SCALE, accruedSy: 0n }
  const maturity = 1000n

  it('uses the live rate before maturity', () => {
    // At t=500 the rate is 1e12 + 500*2e8 = 1.1e12; matches projectedClaimable at that rate.
    expect(claimableAt(pos, cp, maturity, 500n)).toBe(projectedClaimable(pos, rateAt(cp, 500n)))
  })

  it('freezes at the maturity rate once matured, so claimable plateaus', () => {
    const atMaturity = projectedClaimable(pos, rateAt(cp, maturity))
    // Any time past maturity yields exactly the maturity-frozen value — never more.
    expect(claimableAt(pos, cp, maturity, 1000n)).toBe(atMaturity)
    expect(claimableAt(pos, cp, maturity, 5000n)).toBe(atMaturity)
    expect(claimableAt(pos, cp, maturity, 999_999n)).toBe(atMaturity)
  })
})

describe('ratePerMinutePct', () => {
  it('converts a per-second slope into percent-per-minute', () => {
    // 200_000_000 / 1e12 = 0.0002/s -> 1.2%/min.
    expect(ratePerMinutePct(200_000_000n)).toBeCloseTo(1.2, 6)
  })
})

describe('maturityCountdown', () => {
  it('breaks remaining time into d/h/m/s', () => {
    const now = 1_000_000_000_000 // ms
    const maturity = BigInt(now / 1000 + 3661) // +1h 1m 1s
    const c = maturityCountdown(maturity, now)
    expect(c.matured).toBe(false)
    expect(c).toMatchObject({ days: 0, hours: 1, minutes: 1, seconds: 1 })
  })

  it('reports matured once reached', () => {
    const now = 1_000_000_000_000
    expect(maturityCountdown(BigInt(now / 1000 - 5), now).matured).toBe(true)
  })
})
