/** MockYieldToken (mUSDY) service: balance/rate reads and the demo faucet. */
import type { AssembledTransaction, MethodOptions } from '@stellar/stellar-sdk/contract'
import { config } from '../../config'
import type { AppError } from '../../types'
import { getClient, invokeWrite, readCall, type OnTxPhase } from './base'
import { MYT_ERRORS } from './errors'

/** The rate checkpoint driving a client-side live ticker. */
export interface RateInfo {
  /** Unix timestamp the checkpoint took effect. */
  since: bigint
  /** Exchange rate at `since`, scaled by 1e12. */
  rate: bigint
  /** Rate increase per second, scaled by 1e12. */
  slopePerSec: bigint
}

/** Runtime shape of the deployed MockYieldToken (methods from the on-chain spec). */
interface MytClient {
  balance(args: { id: string }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>
  exchange_rate(options?: MethodOptions): Promise<AssembledTransaction<bigint>>
  get_rate_info(
    options?: MethodOptions,
  ): Promise<AssembledTransaction<{ since: bigint; rate: bigint; slope_per_sec: bigint }>>
  faucet(
    args: { to: string; amount: bigint },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<null>>
}

const client = (): Promise<MytClient> => getClient<MytClient>(config.mytContractId)

/** Read `address`'s mUSDY balance (0 if the account has none / doesn't exist). */
export async function readMytBalance(address: string): Promise<bigint | AppError> {
  const c = await client()
  return readCall(() => c.balance({ id: address }), MYT_ERRORS)
}

/** Read the current rate checkpoint (for the live accrual ticker). */
export async function readRateInfo(): Promise<RateInfo | AppError> {
  const c = await client()
  const result = await readCall(() => c.get_rate_info(), MYT_ERRORS)
  if (typeof result === 'object' && 'since' in result) {
    return { since: result.since, rate: result.rate, slopePerSec: result.slope_per_sec }
  }
  return result
}

/** Mint `amount` (stroops) of mUSDY to `address` via the public faucet. */
export async function requestFaucet(
  address: string,
  amount: bigint,
  onPhase: OnTxPhase,
): Promise<{ hash: string } | AppError> {
  const c = await client()
  const result = await invokeWrite(
    (options) => c.faucet({ to: address, amount }, options),
    address,
    onPhase,
    MYT_ERRORS,
  )
  return 'hash' in result ? { hash: result.hash } : result
}
