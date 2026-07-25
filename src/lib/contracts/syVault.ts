/** SYVault service: SY balance reads and wrap/unwrap writes. */
import type { AssembledTransaction, MethodOptions } from '@stellar/stellar-sdk/contract'
import type { AppError } from '../../types'
import { activeMarket } from '../market'
import { getClient, invokeWrite, readCall, type OnTxPhase } from './base'
import { SY_ERRORS, wrapErrors } from './errors'

/** Runtime shape of the deployed SYVault (methods from the on-chain spec). */
interface SyClient {
  balance(args: { id: string }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>
  exchange_rate(options?: MethodOptions): Promise<AssembledTransaction<bigint>>
  wrap(
    args: { from: string; amount: bigint },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<bigint>>
  unwrap(
    args: { from: string; amount: bigint },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<bigint>>
}

const client = (): Promise<SyClient> => getClient<SyClient>(activeMarket().syVaultContractId)

/** Read the vault's current exchange rate (SY → underlying, scaled by 1e12). */
export async function readExchangeRate(): Promise<bigint | AppError> {
  const c = await client()
  return readCall(() => c.exchange_rate(), SY_ERRORS)
}

/** Read `address`'s SY balance. */
export async function readSyBalance(address: string): Promise<bigint | AppError> {
  const c = await client()
  return readCall(() => c.balance({ id: address }), SY_ERRORS)
}

/** Wrap `amount` (stroops) of the underlying token into SY. */
export async function wrapTokens(
  address: string,
  amount: bigint,
  onPhase: OnTxPhase,
): Promise<{ hash: string; newBalance: bigint } | AppError> {
  const c = await client()
  const result = await invokeWrite(
    (options) => c.wrap({ from: address, amount }, options),
    address,
    onPhase,
    wrapErrors(activeMarket().underlyingSymbol),
  )
  return 'hash' in result ? { hash: result.hash, newBalance: result.result } : result
}

/** Unwrap `amount` (stroops) of SY back into the underlying token. */
export async function unwrapTokens(
  address: string,
  amount: bigint,
  onPhase: OnTxPhase,
): Promise<{ hash: string; newBalance: bigint } | AppError> {
  const c = await client()
  const result = await invokeWrite(
    (options) => c.unwrap({ from: address, amount }, options),
    address,
    onPhase,
    SY_ERRORS,
  )
  return 'hash' in result ? { hash: result.hash, newBalance: result.result } : result
}
