/** Friendbot service: fund an unfunded Testnet account with XLM, handling the already-funded case. */
import { config } from '../config'
import type { AppError } from '../types'

/**
 * Fund an unfunded Testnet account via Friendbot (~10,000 XLM, once per account).
 * Treats an already-funded account as a clear, non-fatal AppError so callers can
 * surface the message without treating it as a hard failure.
 * @param address - Account public key to fund.
 * @returns `{ ok: true }` on funding, or a friendly AppError.
 */
export async function fundTestnetAccount(address: string): Promise<{ ok: true } | AppError> {
  try {
    const url = `${config.friendbotUrl}/?addr=${encodeURIComponent(address)}`
    const response = await fetch(url)

    if (response.ok) {
      return { ok: true }
    }

    // Friendbot returns 400 when the account already exists on the network.
    const body = await safeReadText(response)
    if (response.status === 400 && /op_already_exists|already.?exist|already.?fund/i.test(body)) {
      return { code: 'already_funded', message: 'This account is already funded on Testnet.' }
    }

    return {
      code: 'friendbot_failed',
      message: `Friendbot could not fund the account (HTTP ${response.status.toString()}).`,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return { code: 'friendbot_unreachable', message: `Could not reach Friendbot: ${message}` }
  }
}

/** Read a response body as text, swallowing any parse error. */
async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}
