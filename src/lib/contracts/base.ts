/**
 * Shared plumbing for the three contract service modules, built on the
 * official `@stellar/stellar-sdk/contract` Client/AssembledTransaction
 * pipeline. Reads run as free simulate-only calls; writes go build → simulate
 * → sign (via the connected wallet) → submit → poll.
 */
import {
  type AssembledTransaction,
  Client as ContractClient,
  type MethodOptions,
  type SignTransaction,
} from '@stellar/stellar-sdk/contract'
import { config } from '../../config'
import { signXdr } from '../wallet'
import { isAppError, type AppError } from '../../types'
import { classifyContractError, type ErrorTable } from './errors'

export type { ErrorTable } from './errors'

/** Cache of contract clients, keyed by contract ID (spec fetched once each). */
const clientCache = new Map<string, Promise<unknown>>()

/**
 * Lazily build and memoize a contract client for `contractId`. The concrete
 * per-contract method shape is supplied by the caller via the `T` cast, since
 * the Client's methods are attached at runtime from the on-chain spec.
 */
export function getClient<T>(contractId: string): Promise<T> {
  let cached = clientCache.get(contractId)
  if (!cached) {
    cached = ContractClient.from({
      contractId,
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.sorobanRpcUrl,
    })
    clientCache.set(contractId, cached)
  }
  return cached as Promise<T>
}

/** Phase callback fired as a write call progresses through the tx lifecycle. */
export type TxPhase = 'building' | 'signing' | 'pending'
export type OnTxPhase = (phase: TxPhase, hash?: string) => void

/**
 * Run a write call through the full lifecycle: build the AssembledTransaction
 * (via `build`, which receives the method options), then sign+send it with
 * phase callbacks. Returns the tx hash and the parsed contract return value,
 * or a normalized AppError.
 */
export async function invokeWrite<T>(
  build: (options: MethodOptions) => Promise<AssembledTransaction<T>>,
  address: string,
  onPhase: OnTxPhase,
  errorTable: ErrorTable,
): Promise<{ hash: string; result: T } | AppError> {
  try {
    onPhase('building')
    const tx = await build({
      publicKey: address,
      signTransaction: makeSignTransactionAdapter(address),
    })
    onPhase('signing')
    const sent = await tx.signAndSend({
      watcher: {
        onSubmitted: (response) => {
          if (response) onPhase('pending', response.hash)
        },
        onProgress: () => {
          onPhase('pending')
        },
      },
    })
    return { hash: sent.sendTransactionResponse?.hash ?? '', result: sent.result }
  } catch (e) {
    return classifyContractError(e, errorTable)
  }
}

/** Run a read call and return its parsed result, or a normalized AppError. */
export async function readCall<T>(
  call: () => Promise<AssembledTransaction<T>>,
  errorTable: ErrorTable,
): Promise<T | AppError> {
  try {
    const tx = await call()
    return tx.result
  } catch (e) {
    return classifyContractError(e, errorTable)
  }
}

/**
 * Adapt our wallet.ts `signXdr` to the SDK's `SignTransaction` shape, closing
 * over the connected address (the generated methods can't thread it through).
 */
function makeSignTransactionAdapter(address: string): SignTransaction {
  return async (xdr, opts) => {
    const result = await signXdr(xdr, {
      address,
      networkPassphrase: opts?.networkPassphrase ?? config.networkPassphrase,
    })
    if (isAppError(result)) {
      return {
        signedTxXdr: '',
        error: { message: result.message, code: result.code === 'user_declined' ? -4 : -1 },
      }
    }
    return { signedTxXdr: result }
  }
}
