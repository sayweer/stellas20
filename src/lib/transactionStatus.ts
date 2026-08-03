import { Api, Server } from '@stellar/stellar-sdk/rpc'
import { config } from '../config'
import type { AppError } from '../types'

const server = new Server(config.sorobanRpcUrl)

export type CheckedTransactionStatus = 'success' | 'failed' | 'not_found'

/** Keep RPC status interpretation pure so every finality branch is testable. */
export function interpretTransactionStatus(status: unknown): CheckedTransactionStatus | AppError {
  switch (status) {
    case Api.GetTransactionStatus.SUCCESS:
      return 'success'
    case Api.GetTransactionStatus.FAILED:
      return 'failed'
    case Api.GetTransactionStatus.NOT_FOUND:
      return 'not_found'
    default:
      return {
        code: 'transaction_status_unknown',
        message: 'Stellar returned an unknown transaction status. Wait a moment and check again.',
      }
  }
}

/**
 * Ask Stellar RPC for the final state of a previously submitted transaction.
 * A missing result is intentionally distinct from failure: recent transactions
 * may not have reached the RPC node yet, so callers should retain any safety
 * lock and let the user check again.
 */
export async function checkTransactionStatus(
  hash: string,
): Promise<CheckedTransactionStatus | AppError> {
  try {
    const response = await server.getTransaction(hash)

    return interpretTransactionStatus(response.status)
  } catch {
    return {
      code: 'transaction_status_unavailable',
      message:
        'Everspan could not reach Stellar to verify this transaction. Your actions remain locked; check again when the connection is stable.',
    }
  }
}
