/** Stellar SDK service: Horizon account/balance queries (native XLM wallet balance). */
import { Horizon } from '@stellar/stellar-sdk'
import { config } from '../config'
import type { AppError } from '../types'

const server = new Horizon.Server(config.horizonUrl)

/**
 * Fetch the account's native XLM balance from Horizon.
 * @param address - Account public key.
 * @returns the funded balance, `{ funded: false }` for an unfunded (404) account,
 *   or a friendly AppError for network issues.
 */
export async function getXlmBalance(
  address: string,
): Promise<{ balance: string; funded: true } | { funded: false } | AppError> {
  try {
    const account = await server.loadAccount(address)
    const native = account.balances.find((b) => b.asset_type === 'native')
    return { balance: native ? native.balance : '0', funded: true }
  } catch (e) {
    if (isNotFound(e)) {
      return { funded: false }
    }
    return {
      code: 'balance_unavailable',
      message: 'Could not load your balance from the network. Check your connection and try again.',
    }
  }
}

/** True when a Horizon error indicates the resource does not exist (HTTP 404). */
function isNotFound(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) {
    return false
  }
  const response = (e as { response?: { status?: number } }).response
  return response?.status === 404
}
