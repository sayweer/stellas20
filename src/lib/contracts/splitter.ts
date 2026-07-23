/** Splitter service: maturity/position reads and split/merge/claim/redeem writes. */
import type { AssembledTransaction, MethodOptions } from '@stellar/stellar-sdk/contract'
import { config } from '../../config'
import type { AppError } from '../../types'
import { getClient, invokeWrite, readCall, type OnTxPhase } from './base'
import { SPLITTER_ERRORS, SPLITTER_WRITE_ERRORS } from './errors'

/**
 * A user's account for one maturity, all amounts in stroops. `index` is the
 * rate at the user's last settlement (0 = never touched) — with `yt` and
 * `accruedSy` it lets the client project claimable live between polls.
 */
export interface AccountView {
  pt: bigint
  yt: bigint
  index: bigint
  accruedSy: bigint
  claimable: bigint
}

/** Runtime shape of the deployed Splitter (methods from the on-chain spec). */
interface SplitterClient {
  get_maturities(options?: MethodOptions): Promise<AssembledTransaction<bigint[]>>
  get_account(
    args: { addr: string; maturity: bigint },
    options?: MethodOptions,
  ): Promise<
    AssembledTransaction<{
      pt: bigint
      yt: bigint
      index: bigint
      accrued_sy: bigint
      claimable: bigint
    }>
  >
  get_totals(
    args: { maturity: bigint },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<{ pt_supply: bigint; yt_supply: bigint }>>
  preview_claimable(
    args: { addr: string; maturity: bigint },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<bigint>>
  split(
    args: { from: string; maturity: bigint; sy_amount: bigint },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<bigint>>
  merge(
    args: { from: string; maturity: bigint; pt_amount: bigint },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<bigint>>
  claim_yield(
    args: { from: string; maturity: bigint },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<bigint>>
  redeem_pt(
    args: { from: string; maturity: bigint; pt_amount: bigint },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<bigint>>
}

const client = (): Promise<SplitterClient> => getClient<SplitterClient>(config.splitterContractId)

/** Read the list of registered maturity timestamps (unix seconds). */
export async function readMaturities(): Promise<bigint[] | AppError> {
  const c = await client()
  return readCall(() => c.get_maturities(), SPLITTER_ERRORS)
}

/** Read `address`'s full account (balances + yield state) for `maturity`. */
export async function readAccount(
  address: string,
  maturity: bigint,
): Promise<AccountView | AppError> {
  const c = await client()
  const result = await readCall(() => c.get_account({ addr: address, maturity }), SPLITTER_ERRORS)
  if (typeof result === 'object' && 'pt' in result) {
    return {
      pt: result.pt,
      yt: result.yt,
      index: result.index,
      accruedSy: result.accrued_sy,
      claimable: result.claimable,
    }
  }
  return result
}

/** Read the aggregate PT/YT supplies for `maturity`. */
export async function readTotals(
  maturity: bigint,
): Promise<{ ptSupply: bigint; ytSupply: bigint } | AppError> {
  const c = await client()
  const result = await readCall(() => c.get_totals({ maturity }), SPLITTER_ERRORS)
  if (typeof result === 'object' && 'pt_supply' in result) {
    return { ptSupply: result.pt_supply, ytSupply: result.yt_supply }
  }
  return result
}

/** Read the SY `address` could claim right now for `maturity`. */
export async function readPreviewClaimable(
  address: string,
  maturity: bigint,
): Promise<bigint | AppError> {
  const c = await client()
  return readCall(() => c.preview_claimable({ addr: address, maturity }), SPLITTER_ERRORS)
}

/** Split `syAmount` (stroops) SY into equal PT/YT for `maturity`. Returns PT minted. */
export async function splitSy(
  address: string,
  maturity: bigint,
  syAmount: bigint,
  onPhase: OnTxPhase,
): Promise<{ hash: string; ptOut: bigint } | AppError> {
  const c = await client()
  const result = await invokeWrite(
    (options) => c.split({ from: address, maturity, sy_amount: syAmount }, options),
    address,
    onPhase,
    SPLITTER_WRITE_ERRORS,
  )
  return 'hash' in result ? { hash: result.hash, ptOut: result.result } : result
}

/** Merge `ptAmount` (stroops) PT + YT back into SY for `maturity`. Returns SY out. */
export async function mergePtYt(
  address: string,
  maturity: bigint,
  ptAmount: bigint,
  onPhase: OnTxPhase,
): Promise<{ hash: string; syOut: bigint } | AppError> {
  const c = await client()
  const result = await invokeWrite(
    (options) => c.merge({ from: address, maturity, pt_amount: ptAmount }, options),
    address,
    onPhase,
    SPLITTER_WRITE_ERRORS,
  )
  return 'hash' in result ? { hash: result.hash, syOut: result.result } : result
}

/** Claim all accrued yield for `maturity`. Returns SY paid out. */
export async function claimYield(
  address: string,
  maturity: bigint,
  onPhase: OnTxPhase,
): Promise<{ hash: string; syOut: bigint } | AppError> {
  const c = await client()
  const result = await invokeWrite(
    (options) => c.claim_yield({ from: address, maturity }, options),
    address,
    onPhase,
    SPLITTER_WRITE_ERRORS,
  )
  return 'hash' in result ? { hash: result.hash, syOut: result.result } : result
}

/** Redeem `ptAmount` (stroops) PT for its fixed principal at/after maturity. Returns SY out. */
export async function redeemPt(
  address: string,
  maturity: bigint,
  ptAmount: bigint,
  onPhase: OnTxPhase,
): Promise<{ hash: string; syOut: bigint } | AppError> {
  const c = await client()
  const result = await invokeWrite(
    (options) => c.redeem_pt({ from: address, maturity, pt_amount: ptAmount }, options),
    address,
    onPhase,
    SPLITTER_WRITE_ERRORS,
  )
  return 'hash' in result ? { hash: result.hash, syOut: result.result } : result
}
