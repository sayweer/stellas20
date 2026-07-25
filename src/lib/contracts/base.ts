/**
 * Shared plumbing for the contract service modules, built on the official
 * `@stellar/stellar-sdk/contract` Client/AssembledTransaction pipeline. Reads
 * run as free simulate-only calls; writes go build → simulate → sign (via the
 * connected wallet) → submit → poll.
 */
import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  scValToNative,
  type xdr,
} from '@stellar/stellar-sdk'
import { Api, Server } from '@stellar/stellar-sdk/rpc'
import {
  type AssembledTransaction,
  Client as ContractClient,
  type MethodOptions,
  NULL_ACCOUNT,
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

const server = new Server(config.sorobanRpcUrl)

/**
 * Simulate a read against a contract without fetching its spec first.
 *
 * The spec-based `Client` cannot be built for a Stellar Asset Contract: a SAC
 * is implemented by the host, so it has no wasm to download and the client's
 * spec fetch throws. Since the underlying asset of a market may well be a SAC
 * (the Blend market supplies plain XLM), reads against it go through this
 * hand-rolled path instead.
 */
export async function simulateRead<T>(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  errorTable: ErrorTable,
): Promise<T | AppError> {
  try {
    // Simulation never checks that the source exists or that its sequence is
    // right, so the SDK's null account keeps reads working while disconnected.
    const tx = new TransactionBuilder(new Account(NULL_ACCOUNT, '0'), {
      fee: BASE_FEE,
      networkPassphrase: config.networkPassphrase,
    })
      .addOperation(new Contract(contractId).call(method, ...args))
      .setTimeout(30)
      .build()

    const sim = await server.simulateTransaction(tx)
    if (!Api.isSimulationSuccess(sim) || !sim.result) {
      throw new Error(Api.isSimulationError(sim) ? sim.error : 'Simulation returned no result.')
    }
    return scValToNative(sim.result.retval) as T
  } catch (e) {
    return classifyContractError(e, errorTable)
  }
}

/** Build an `Address` ScVal argument for `simulateRead`. */
export function addressArg(address: string): xdr.ScVal {
  return new Address(address).toScVal()
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
    return {
      hash: sent.sendTransactionResponse?.hash ?? '',
      result: unwrapSpecResult<T>(sent.result),
    }
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
    return unwrapSpecResult<T>(tx.result)
  } catch (e) {
    return classifyContractError(e, errorTable)
  }
}

/**
 * Contract methods declared `Result<T, E>` come back from the spec-generated
 * client as `Ok { value }` / `Err` objects with an `unwrap()`; plain-returning
 * methods come back raw. Normalize both to `T` — an `Err` unwraps into a
 * throw, which the callers' catch classifies into a friendly AppError.
 */
function unwrapSpecResult<T>(value: unknown): T {
  if (
    value !== null &&
    typeof value === 'object' &&
    'unwrap' in value &&
    typeof (value as { unwrap: unknown }).unwrap === 'function'
  ) {
    return (value as { unwrap: () => T }).unwrap()
  }
  return value as T
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
