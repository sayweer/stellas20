/**
 * PT-AMM service: pool reads and swap quotes (simulate-only). Trade/LP write
 * flows arrive with the product UI (MASTERPLAN Phase 4).
 */
import type { AssembledTransaction, MethodOptions } from '@stellar/stellar-sdk/contract'
import { config } from '../../config'
import type { AppError } from '../../types'
import { getClient, readCall } from './base'
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
}

const client = (): Promise<AmmClient> => getClient<AmmClient>(config.ammContractId)

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
