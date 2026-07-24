/**
 * Pure client-side AMM math mirroring the PT-AMM contract, plus the
 * fixed-income display conversions (implied APY, discount, price impact) the
 * product UI needs. Quote math is exact bigint — identical to the contract, so
 * a client quote equals the on-chain execution in the same reserve state. Only
 * the annualized-rate conversions, which are inherently approximate display
 * figures, touch `Number`.
 */
import { RATE_SCALE } from './yield'

/** Seconds in a (non-leap) year — the annualization base for APY figures. */
export const YEAR_SECONDS = 31_536_000

/** Fee: 30 bps on input, as `in·997/1000` (matches the contract constants). */
const FEE_NUM = 997n
const FEE_DEN = 1000n

/** Which asset goes in on a swap (mirrors the contract enum). */
export type SwapSide = 'PtToSy' | 'SyToPt'

/** Reserves for one pool, in stroops. */
export interface Reserves {
  ptReserve: bigint
  syReserve: bigint
}

/**
 * Output of an exact-input swap: `floor(in·997·R_out / (R_in·1000 + in·997))`.
 * Byte-for-byte the contract's `quote`, so this equals on-chain execution.
 */
export function quoteAmountOut(reserveIn: bigint, reserveOut: bigint, amountIn: bigint): bigint {
  if (reserveIn <= 0n || reserveOut <= 0n || amountIn <= 0n) return 0n
  const inWithFee = amountIn * FEE_NUM
  return (inWithFee * reserveOut) / (reserveIn * FEE_DEN + inWithFee)
}

/** The (reserveIn, reserveOut) pair for a swap side. */
export function reservesForSide(pool: Reserves, side: SwapSide): [bigint, bigint] {
  return side === 'SyToPt'
    ? [pool.syReserve, pool.ptReserve]
    : [pool.ptReserve, pool.syReserve]
}

/** Quote a swap on a pool by side — the form the UI calls. */
export function quoteSwap(pool: Reserves, side: SwapSide, amountIn: bigint): bigint {
  const [rIn, rOut] = reservesForSide(pool, side)
  return quoteAmountOut(rIn, rOut, amountIn)
}

/**
 * Slippage floor: the least output the user will accept, `quotedOut` reduced by
 * `slippageBps` basis points, rounded down (so the guard is never looser than
 * asked).
 */
export function minOutFromSlippage(quotedOut: bigint, slippageBps: number): bigint {
  if (quotedOut <= 0n) return 0n
  const bps = BigInt(Math.max(0, Math.min(10_000, Math.round(slippageBps))))
  return (quotedOut * (10_000n - bps)) / 10_000n
}

/**
 * Asset units paid per 1 PT at the pool's spot mid price: `p_spot · R / SCALE`,
 * where `p_spot = syReserve / ptReserve` (SY per PT). Since 1 PT redeems SY
 * worth exactly 1 asset unit at maturity, this cost being below 1 is the
 * discount that becomes a fixed yield. Null when the pool is empty.
 */
export function ptCostInAsset(pool: Reserves, rateNow: bigint): number | null {
  if (pool.ptReserve <= 0n || pool.syReserve <= 0n || rateNow <= 0n) return null
  const pSpot = Number(pool.syReserve) / Number(pool.ptReserve)
  return (pSpot * Number(rateNow)) / Number(RATE_SCALE)
}

/**
 * Annualize a per-PT asset cost to an implied fixed APY: `(1/cost)^(YEAR/Δt) − 1`.
 * Null for a non-positive cost or a non-future maturity.
 */
export function apyFromCost(costAsset: number, dtSeconds: number): number | null {
  if (costAsset <= 0 || dtSeconds <= 0) return null
  return Math.pow(1 / costAsset, YEAR_SECONDS / dtSeconds) - 1
}

/**
 * The pool's headline implied fixed APY at spot — what a marginal PT buyer
 * locks in. Composed from {@link ptCostInAsset} + {@link apyFromCost}.
 */
export function impliedFixedApy(
  pool: Reserves,
  rateNow: bigint,
  dtSeconds: number,
): number | null {
  const cost = ptCostInAsset(pool, rateNow)
  return cost === null ? null : apyFromCost(cost, dtSeconds)
}

/**
 * The APY actually locked by a concrete SY→PT trade (uses the effective
 * execution price, so it already includes fee + price impact): asset paid =
 * `syIn · R / SCALE`, cost per PT = asset paid / `ptOut`. Null if `ptOut ≤ 0`.
 */
export function effectiveApy(
  syIn: bigint,
  ptOut: bigint,
  rateNow: bigint,
  dtSeconds: number,
): number | null {
  if (ptOut <= 0n || syIn <= 0n || rateNow <= 0n) return null
  const assetIn = (Number(syIn) * Number(rateNow)) / Number(RATE_SCALE)
  return apyFromCost(assetIn / Number(ptOut), dtSeconds)
}

/**
 * Underlying yield source APY from the linear rate slope: `slope · YEAR / R`.
 * The mock rate grows linearly, so this is a simple (non-compounding)
 * annualized figure for comparison against the implied fixed APY.
 */
export function underlyingApy(slopePerSec: bigint, rateNow: bigint): number | null {
  if (rateNow <= 0n) return null
  return (Number(slopePerSec) * YEAR_SECONDS) / Number(rateNow)
}

/**
 * Price impact of a trade as a fraction in [0, 1): how far the execution price
 * falls below the marginal (mid) price on this pool. Purely for display.
 */
export function priceImpact(reserveIn: bigint, reserveOut: bigint, amountIn: bigint): number {
  if (reserveIn <= 0n || reserveOut <= 0n || amountIn <= 0n) return 0
  const mid = Number(reserveOut) / Number(reserveIn)
  const out = quoteAmountOut(reserveIn, reserveOut, amountIn)
  const exec = Number(out) / Number(amountIn)
  if (mid <= 0) return 0
  const impact = (mid - exec) / mid
  return impact > 0 ? impact : 0
}

/** Full pool state needed for LP quotes. */
export interface PoolState extends Reserves {
  lpTotal: bigint
}

/** What an `add_liquidity` deposit actually consumes and mints. */
export interface AddQuote {
  ptIn: bigint
  syIn: bigint
  lpMinted: bigint
}

/**
 * Mirror the contract's non-empty `add_liquidity`: one leg is taken in full,
 * the other optimizes down to the pool ratio (floor), and LP shares are the
 * floored min of each leg's pro-rata claim. For the (unused-in-UI) empty pool
 * it echoes the desired amounts with 0 LP.
 */
export function quoteAddLiquidity(
  pool: PoolState,
  ptDesired: bigint,
  syDesired: bigint,
): AddQuote {
  if (pool.ptReserve <= 0n || pool.syReserve <= 0n || pool.lpTotal <= 0n) {
    return { ptIn: ptDesired, syIn: syDesired, lpMinted: 0n }
  }
  const syOptimal = (ptDesired * pool.syReserve) / pool.ptReserve
  let ptIn: bigint
  let syIn: bigint
  if (syOptimal <= syDesired) {
    ptIn = ptDesired
    syIn = syOptimal
  } else {
    ptIn = (syDesired * pool.ptReserve) / pool.syReserve
    syIn = syDesired
  }
  const lpFromPt = (ptIn * pool.lpTotal) / pool.ptReserve
  const lpFromSy = (syIn * pool.lpTotal) / pool.syReserve
  return { ptIn, syIn, lpMinted: lpFromPt < lpFromSy ? lpFromPt : lpFromSy }
}

/** Pro-rata (floored) PT and SY returned for burning `lp` shares. */
export function quoteRemoveLiquidity(pool: PoolState, lp: bigint): { ptOut: bigint; syOut: bigint } {
  if (pool.lpTotal <= 0n || lp <= 0n) return { ptOut: 0n, syOut: 0n }
  return {
    ptOut: (lp * pool.ptReserve) / pool.lpTotal,
    syOut: (lp * pool.syReserve) / pool.lpTotal,
  }
}

/** Format a rate fraction (e.g. 0.052) as a signed percent string ("5.20%"). */
export function formatPercent(fraction: number | null, decimals = 2): string {
  if (fraction === null || !Number.isFinite(fraction)) return '—'
  return `${(fraction * 100).toFixed(decimals)}%`
}
