/**
 * The active market's underlying asset: balance, the rate reading that drives
 * the live ticker, and — where the asset has one — the demo faucet.
 *
 * Both markets speak SEP-41 for balances, so that call is uniform. The rate is
 * not: the mock token publishes a checkpoint with a slope (which the client
 * extrapolates between polls), while a Blend-backed vault can only report the
 * pool's rate right now. `readRateInfo` normalizes the two, reporting a zero
 * slope when there is no forward curve to extrapolate — the UI shows a live
 * rate instead of an APY in that case rather than inventing one.
 */
import type { AssembledTransaction, MethodOptions } from '@stellar/stellar-sdk/contract'
import type { AppError } from '../../types'
import { isAppError } from '../../types'
import { activeMarket } from '../market'
import { chainNowMs } from '../chainTime'
import { addressArg, getClient, invokeWrite, readCall, simulateRead, type OnTxPhase } from './base'
import { readExchangeRate } from './syVault'
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

const client = (): Promise<MytClient> =>
  getClient<MytClient>(activeMarket().underlyingContractId)

/**
 * Read `address`'s underlying balance (0 if the account has none). Goes through
 * the raw simulate path because the underlying may be a Stellar Asset Contract,
 * which has no downloadable spec.
 */
export async function readUnderlyingBalance(address: string): Promise<bigint | AppError> {
  return simulateRead<bigint>(
    activeMarket().underlyingContractId,
    'balance',
    [addressArg(address)],
    MYT_ERRORS,
  )
}

/**
 * Read the rate driving the live accrual ticker. Markets whose underlying
 * publishes a checkpoint (the mock) return its slope; the rest report the
 * vault's current rate with a zero slope.
 */
export async function readRateInfo(): Promise<RateInfo | AppError> {
  if (activeMarket().source !== 'mock') {
    const rate = await readExchangeRate()
    if (isAppError(rate)) return rate
    return { since: BigInt(Math.floor(chainNowMs() / 1000)), rate, slopePerSec: 0n }
  }
  const c = await client()
  const result = await readCall(() => c.get_rate_info(), MYT_ERRORS)
  if (typeof result === 'object' && 'since' in result) {
    return { since: result.since, rate: result.rate, slopePerSec: result.slope_per_sec }
  }
  return result
}

/** Mint `amount` (stroops) of the mock underlying via its public faucet. */
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
