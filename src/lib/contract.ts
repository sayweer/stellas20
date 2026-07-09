/**
 * Soroban contract service for stellas-vault, built on the official
 * `@stellar/stellar-sdk/contract` Client/AssembledTransaction pipeline.
 * Reads run as free simulate-only calls (no wallet needed); writes go
 * through build -> simulate -> sign (via the connected wallet) -> submit ->
 * poll, driven by `AssembledTransaction.signAndSend`.
 */
import {
  AssembledTransaction,
  Client as ContractClient,
  type MethodOptions,
  type SignTransaction,
} from '@stellar/stellar-sdk/contract'
import { config } from '../config'
import { signXdr } from './wallet'
import { isAppError, type AppError } from '../types'

/**
 * The Client's contract methods (`get_total`, `deposit`, ...) are attached
 * dynamically at runtime from the on-chain spec — there is no generated
 * TypeScript package to type them statically. This interface documents the
 * shape we know the deployed vault contract exposes.
 */
interface VaultClient {
  get_total(options?: MethodOptions): Promise<AssembledTransaction<bigint>>
  get_goal(options?: MethodOptions): Promise<AssembledTransaction<bigint>>
  get_contributors(options?: MethodOptions): Promise<AssembledTransaction<number>>
  get_balance(args: { addr: string }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>
  deposit(
    args: { from: string; amount: bigint },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<bigint>>
  withdraw(
    args: { to: string; amount: bigint },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<bigint>>
}

let clientPromise: Promise<VaultClient> | null = null

/** Lazily build (and memoize) the contract client — fetches the on-chain spec once. */
function getClient(): Promise<VaultClient> {
  clientPromise ??= ContractClient.from({
    contractId: config.vaultContractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.sorobanRpcUrl,
    // The dynamic methods added by `Client`'s constructor aren't part of its
    // static type — cast once here to the shape we know this contract has.
  }).then((c) => c as unknown as VaultClient)
  return clientPromise
}

/** Snapshot of the funding pot's on-chain state. */
export interface VaultState {
  total: bigint
  goal: bigint
  contributors: number
  /** The connected account's own recorded balance, or 0n when disconnected. */
  myBalance: bigint
}

/** Read the vault's public state via free simulate-only calls. Works with no wallet connected. */
export async function readVaultState(address: string | null): Promise<VaultState | AppError> {
  try {
    const client = await getClient()
    const [total, goal, contributors, myBalance] = await Promise.all([
      client.get_total().then((tx) => tx.result),
      client.get_goal().then((tx) => tx.result),
      client.get_contributors().then((tx) => tx.result),
      address ? client.get_balance({ addr: address }).then((tx) => tx.result) : Promise.resolve(0n),
    ])
    return { total, goal, contributors, myBalance }
  } catch (e) {
    return classifyContractError(e)
  }
}

/** Phase callback fired as a write call progresses through the tx lifecycle. */
export type TxPhase = 'building' | 'signing' | 'pending'
export type OnTxPhase = (phase: TxPhase, hash?: string) => void

/** Deposit `amount` (stroops) from `address` into the vault. */
export async function depositToVault(
  address: string,
  amount: bigint,
  onPhase: OnTxPhase,
): Promise<{ hash: string; newTotal: bigint } | AppError> {
  return invokeVault('deposit', { from: address, amount }, address, onPhase)
}

/** Withdraw `amount` (stroops) from the vault back to `address`. */
export async function withdrawFromVault(
  address: string,
  amount: bigint,
  onPhase: OnTxPhase,
): Promise<{ hash: string; newTotal: bigint } | AppError> {
  return invokeVault('withdraw', { to: address, amount }, address, onPhase)
}

async function invokeVault(
  method: 'deposit' | 'withdraw',
  args: { from: string; amount: bigint } | { to: string; amount: bigint },
  address: string,
  onPhase: OnTxPhase,
): Promise<{ hash: string; newTotal: bigint } | AppError> {
  try {
    const client = await getClient()
    onPhase('building')
    const methodOptions: MethodOptions = {
      publicKey: address,
      signTransaction: makeSignTransactionAdapter(address),
    }
    const tx =
      method === 'deposit'
        ? await client.deposit(args as { from: string; amount: bigint }, methodOptions)
        : await client.withdraw(args as { to: string; amount: bigint }, methodOptions)

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

    return { hash: sent.sendTransactionResponse?.hash ?? '', newTotal: sent.result }
  } catch (e) {
    return classifyContractError(e)
  }
}

/**
 * Builds a `SignTransaction` adapter over our wallet.ts `signXdr`, closing
 * over the known connected address (the Client's generated methods have no
 * way to thread an `address` through to the signer callback themselves).
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

/** Contract errors surface as `Error(Contract, #N)` in a thrown message; map known codes to friendly text. */
const CONTRACT_ERROR_PATTERN = /Error\(Contract, #(\d+)\)/

const VAULT_ERROR_MESSAGES: Record<number, AppError> = {
  1: { code: 'already_initialized', message: 'This vault has already been initialized.' },
  2: { code: 'not_initialized', message: 'The vault has not been initialized yet.' },
  3: { code: 'invalid_amount', message: 'Enter an amount greater than 0.' },
  4: {
    code: 'insufficient_balance',
    message: 'That exceeds your recorded balance in the vault.',
  },
}

/** Map a thrown error from the contract pipeline into a friendly, specific AppError. */
function classifyContractError(e: unknown): AppError {
  const message = e instanceof Error ? e.message : String(e)

  const match = CONTRACT_ERROR_PATTERN.exec(message)
  if (match) {
    const known = VAULT_ERROR_MESSAGES[Number(match[1])]
    if (known) return known
  }
  if (e instanceof AssembledTransaction.Errors.UserRejected || /declin|reject|cancel/i.test(message)) {
    return { code: 'user_declined', message: 'You cancelled the transaction.' }
  }
  if (/account.*not.*found|not.*exist/i.test(message)) {
    return {
      code: 'account_unfunded',
      message: 'Your account is not funded yet. Fund it with Friendbot and try again.',
    }
  }
  return { code: 'contract_error', message: 'The vault transaction failed. Please try again.' }
}
