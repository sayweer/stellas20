import { describe, expect, it } from 'vitest'
import {
  apyFromCost,
  effectiveApy,
  formatPercent,
  impliedFixedApy,
  minOutFromSlippage,
  priceImpact,
  ptCostInAsset,
  quoteAmountOut,
  quoteSwap,
  underlyingApy,
} from './amm'
import { RATE_SCALE } from './yield'

describe('quoteAmountOut', () => {
  it('matches the contract fixture (1e7 into a symmetric 1e10 pool)', () => {
    // out = 1e7·997·1e10 / (1e10·1000 + 1e7·997) = 9_960_069 — identical to the
    // Rust test test_swap_exact_in_hand_computed_fixture.
    expect(quoteAmountOut(1000_0000000n, 1000_0000000n, 1_0000000n)).toBe(9_960_069n)
  })

  it('returns 0 on an empty reserve or non-positive input', () => {
    expect(quoteAmountOut(0n, 100n, 10n)).toBe(0n)
    expect(quoteAmountOut(100n, 0n, 10n)).toBe(0n)
    expect(quoteAmountOut(100n, 100n, 0n)).toBe(0n)
  })

  it('is monotonic and bounded by the output reserve', () => {
    const small = quoteAmountOut(100_0000000n, 100_0000000n, 1_0000000n)
    const large = quoteAmountOut(100_0000000n, 100_0000000n, 50_0000000n)
    expect(large).toBeGreaterThan(small)
    // Even a huge input can never drain the whole output reserve.
    expect(quoteAmountOut(100n, 100n, 10n ** 18n)).toBeLessThan(100n)
  })
})

describe('quoteSwap by side', () => {
  const pool = { ptReserve: 90_0000000n, syReserve: 40_0000000n }
  it('routes reserves correctly per side', () => {
    // SyToPt: in=SY reserve, out=PT reserve.
    expect(quoteSwap(pool, 'SyToPt', 1_0000000n)).toBe(
      quoteAmountOut(pool.syReserve, pool.ptReserve, 1_0000000n),
    )
    expect(quoteSwap(pool, 'PtToSy', 1_0000000n)).toBe(
      quoteAmountOut(pool.ptReserve, pool.syReserve, 1_0000000n),
    )
  })
})

describe('minOutFromSlippage', () => {
  it('floors the output by the given basis points', () => {
    expect(minOutFromSlippage(1_0000000n, 50)).toBe(9_950_000n) // 0.5% off
    expect(minOutFromSlippage(1_0000000n, 100)).toBe(9_900_000n) // 1% off
    expect(minOutFromSlippage(1_0000000n, 0)).toBe(1_0000000n) // no slippage
  })

  it('clamps out-of-range bps and handles zero', () => {
    expect(minOutFromSlippage(0n, 50)).toBe(0n)
    expect(minOutFromSlippage(1_0000000n, 20_000)).toBe(0n) // clamped to 100%
  })
})

describe('ptCostInAsset', () => {
  it('is the spot SY-per-PT price scaled by the exchange rate', () => {
    // p_spot = 0.988 SY/PT at rate 1.0 -> cost 0.988 asset/PT.
    const pool = { ptReserve: 1000_0000000n, syReserve: 988_0000000n }
    expect(ptCostInAsset(pool, RATE_SCALE)).toBeCloseTo(0.988, 9)
  })

  it('is null for an empty pool', () => {
    expect(ptCostInAsset({ ptReserve: 0n, syReserve: 10n }, RATE_SCALE)).toBeNull()
  })
})

describe('apyFromCost / impliedFixedApy', () => {
  const NINETY_DAYS = 90 * 86400

  it('annualizes a 0.988 cost over 90 days to ~5.0%', () => {
    const apy = apyFromCost(0.988, NINETY_DAYS)
    expect(apy).not.toBeNull()
    expect(apy as number).toBeGreaterThan(0.048)
    expect(apy as number).toBeLessThan(0.052)
  })

  it('composes reserves + rate into the same figure', () => {
    const pool = { ptReserve: 1000_0000000n, syReserve: 988_0000000n }
    const composed = impliedFixedApy(pool, RATE_SCALE, NINETY_DAYS)
    expect(composed).toBeCloseTo(apyFromCost(0.988, NINETY_DAYS) as number, 9)
  })

  it('is null for a non-future maturity or par/over-par cost', () => {
    expect(apyFromCost(0.988, 0)).toBeNull()
    expect(apyFromCost(1.0, NINETY_DAYS)).toBe(0)
    // Over par (cost > 1) implies a negative yield — still a finite number.
    expect(apyFromCost(1.01, NINETY_DAYS)).toBeLessThan(0)
  })
})

describe('effectiveApy', () => {
  it('uses the executed price (asset paid per PT received)', () => {
    // Pay 98.8 SY (rate 1.0 -> 98.8 asset) for 100 PT over 90 days:
    // cost 0.988 -> ~5% APY, matching the spot fixture.
    const apy = effectiveApy(988_0000000n, 1000_0000000n, RATE_SCALE, 90 * 86400)
    expect(apy as number).toBeGreaterThan(0.048)
    expect(apy as number).toBeLessThan(0.052)
  })

  it('is null when no PT is received', () => {
    expect(effectiveApy(10n, 0n, RATE_SCALE, 1000)).toBeNull()
  })
})

describe('underlyingApy', () => {
  it('annualizes the linear slope: slope·YEAR/R', () => {
    // The deploy default: slope 1585 at rate 1e12 -> ~5.0% APY.
    const apy = underlyingApy(1585n, RATE_SCALE)
    expect(apy as number).toBeCloseTo(0.05, 3)
  })
})

describe('priceImpact', () => {
  it('is near zero for a tiny trade and grows with size', () => {
    const tiny = priceImpact(1000_0000000n, 1000_0000000n, 1_0000000n)
    const big = priceImpact(1000_0000000n, 1000_0000000n, 500_0000000n)
    expect(tiny).toBeGreaterThan(0)
    expect(tiny).toBeLessThan(0.01)
    expect(big).toBeGreaterThan(tiny)
  })
})

describe('formatPercent', () => {
  it('formats fractions and guards null/NaN', () => {
    expect(formatPercent(0.0523)).toBe('5.23%')
    expect(formatPercent(-0.01)).toBe('-1.00%')
    expect(formatPercent(null)).toBe('—')
    expect(formatPercent(Infinity)).toBe('—')
  })
})
