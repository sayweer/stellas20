/**
 * PT-AMM service: pool reads and swap quotes (simulate-only). Trade/LP write
 * flows arrive with the product UI (MASTERPLAN Phase 4).
 */
import type { AssembledTransaction, MethodOptions } from '@stellar/stellar-sdk/contract'
import type { AppError } from '../../types'
import { activeMarket } from '../market'
import { getClient, invokeWrite, readCall, type OnTxPhase } from './base'
import { AMM_ERRORS } from './errors'

/** Which asset goes in on a swap (mirrors the contract enum). */
export type SwapSide = 'PtToSy' | 'SyToPt'

/** One maturity's pool state, all amounts in stroops. */
export interface PoolView {
  ptToken: string
  ptReserve: bigint
  syReserve: bigint
  lpTotal: bigint
}

/** Spec-generated unit-variant enums travel as `{ tag }` values. */
interface SideArg {
  tag: SwapSide
}

/** Runtime shape of the deployed PT-AMM (methods from the on-chain spec). */
interface AmmClient {
  get_pool(
    args: { maturity: bigint },
    options?: MethodOptions,
  ): Promise<
    AssembledTransaction<{
      pt_token: string
      pt_reserve: bigint
      sy_reserve: bigint
      lp_total: bigint
    }>
  >
  quote_swap(
    args: { maturity: bigint; side: SideArg; amount_in: bigint },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<bigint>>
  lp_balance(
    args: { addr: string; maturity: bigint },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<bigint>>
  swap_exact_in(
    args: { from: string; maturity: bigint; side: SideArg; amount_in: bigint; min_out: bigint },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<bigint>>
  add_liquidity(
    args: {
      from: string
      maturity: bigint
      pt_desired: bigint
      sy_desired: bigint
      pt_min: bigint
      sy_min: bigint
    },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<bigint>>
  remove_liquidity(
    args: { from: string; maturity: bigint; lp: bigint; pt_min: bigint; sy_min: bigint },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<readonly [bigint, bigint]>>
}

const client = (): Promise<AmmClient> => getClient<AmmClient>(activeMarket().ammContractId)

/** Read the pool state for `maturity`. */
export async function readPool(maturity: bigint): Promise<PoolView | AppError> {
  const c = await client()
  const result = await readCall(() => c.get_pool({ maturity }), AMM_ERRORS)
  if (typeof result === 'object' && 'pt_reserve' in result) {
    return {
      ptToken: result.pt_token,
      ptReserve: result.pt_reserve,
      syReserve: result.sy_reserve,
      lpTotal: result.lp_total,
    }
  }
  return result
}

/** Quote the output of an exact-input swap at current reserves. */
export async function quoteSwap(
  maturity: bigint,
  side: SwapSide,
  amountIn: bigint,
): Promise<bigint | AppError> {
  const c = await client()
  return readCall(
    () => c.quote_swap({ maturity, side: { tag: side }, amount_in: amountIn }),
    AMM_ERRORS,
  )
}

/** Read `address`'s LP share balance for `maturity`. */
export async function readLpBalance(address: string, maturity: bigint): Promise<bigint | AppError> {
  const c = await client()
  return readCall(() => c.lp_balance({ addr: address, maturity }), AMM_ERRORS)
}

/**
 * Swap `amountIn` (stroops) for at least `minOut` of the other asset. Returns
 * the tx hash and the amount out.
 */
export async function swapExactIn(
  address: string,
  maturity: bigint,
  side: SwapSide,
  amountIn: bigint,
  minOut: bigint,
  onPhase: OnTxPhase,
): Promise<{ hash: string; amountOut: bigint } | AppError> {
  const c = await client()
  const result = await invokeWrite(
    (options) =>
      c.swap_exact_in(
        { from: address, maturity, side: { tag: side }, amount_in: amountIn, min_out: minOut },
        options,
      ),
    address,
    onPhase,
    AMM_ERRORS,
  )
  return 'hash' in result ? { hash: result.hash, amountOut: result.result } : result
}

/**
 * Add liquidity: deposit up to `ptDesired`/`syDesired`, keeping the pool ratio,
 * with `ptMin`/`syMin` as slippage floors. Returns the LP shares minted.
 */
export async function addLiquidity(
  address: string,
  maturity: bigint,
  ptDesired: bigint,
  syDesired: bigint,
  ptMin: bigint,
  syMin: bigint,
  onPhase: OnTxPhase,
): Promise<{ hash: string; lpMinted: bigint } | AppError> {
  const c = await client()
  const result = await invokeWrite(
    (options) =>
      c.add_liquidity(
        {
          from: address,
          maturity,
          pt_desired: ptDesired,
          sy_desired: syDesired,
          pt_min: ptMin,
          sy_min: syMin,
        },
        options,
      ),
    address,
    onPhase,
    AMM_ERRORS,
  )
  return 'hash' in result ? { hash: result.hash, lpMinted: result.result } : result
}

/**
 * Remove `lp` shares for the pro-rata reserves, guarded by `ptMin`/`syMin`.
 * Returns the PT and SY paid out.
 */
export async function removeLiquidity(
  address: string,
  maturity: bigint,
  lp: bigint,
  ptMin: bigint,
  syMin: bigint,
  onPhase: OnTxPhase,
): Promise<{ hash: string; ptOut: bigint; syOut: bigint } | AppError> {
  const c = await client()
  const result = await invokeWrite(
    (options) =>
      c.remove_liquidity({ from: address, maturity, lp, pt_min: ptMin, sy_min: syMin }, options),
    address,
    onPhase,
    AMM_ERRORS,
  )
  return 'hash' in result
    ? { hash: result.hash, ptOut: result.result[0], syOut: result.result[1] }
    : result
}
