/** Stellar SDK service: Horizon account/balance queries and XLM payment building + submission. */
import {
  Horizon,
  Asset,
  TransactionBuilder,
  Operation,
  Networks,
  BASE_FEE,
  Memo,
} from '@stellar/stellar-sdk'
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

/**
 * Build an unsigned XLM payment transaction (Testnet) and return its XDR. Loads
 * the source account for its sequence number, adds a native payment operation,
 * an optional text memo, and a 180s timeout.
 * @returns the unsigned XDR, or a friendly AppError.
 */
export async function buildPaymentXdr(params: {
  source: string
  destination: string
  amount: string
  memo?: string
}): Promise<string | AppError> {
  const { source, destination, amount, memo } = params
  try {
    const account = await server.loadAccount(source)
    const fee = await resolveBaseFee()

    const builder = new TransactionBuilder(account, {
      fee,
      networkPassphrase: Networks.TESTNET,
    }).addOperation(
      Operation.payment({
        destination,
        asset: Asset.native(),
        amount,
      }),
    )

    if (memo && memo.trim() !== '') {
      builder.addMemo(Memo.text(memo.trim()))
    }

    const tx = builder.setTimeout(180).build()
    return tx.toXDR()
  } catch (e) {
    if (isNotFound(e)) {
      return {
        code: 'source_unfunded',
        message: 'Your account is not funded yet. Fund it with Friendbot before sending.',
      }
    }
    return mapBuildError(e)
  }
}

/**
 * Submit a signed transaction XDR to Horizon (Testnet).
 * @param signedXdr - Signed transaction XDR.
 * @returns the transaction hash, or a friendly AppError mapped from Horizon's
 *   result codes (op_underfunded, op_no_destination, tx_bad_seq, timeout, …).
 */
export async function submitSignedXdr(signedXdr: string): Promise<{ hash: string } | AppError> {
  try {
    const tx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET)
    const result = await server.submitTransaction(tx)
    return { hash: result.hash }
  } catch (e) {
    return mapSubmitError(e)
  }
}

/** Current base fee as a stroop string, falling back to BASE_FEE if Horizon is unreachable. */
async function resolveBaseFee(): Promise<string> {
  try {
    const fee = await server.fetchBaseFee()
    return fee.toString()
  } catch {
    return BASE_FEE
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

/** Map a transaction-build failure into a friendly AppError. */
function mapBuildError(e: unknown): AppError {
  const message = e instanceof Error ? e.message : ''
  if (/memo/i.test(message)) {
    return { code: 'invalid_memo', message: 'The memo is too long (max 28 bytes for a text memo).' }
  }
  return {
    code: 'build_failed',
    message: 'Could not build the transaction. Re-check the destination and amount.',
  }
}

/** Map a failed submission into a friendly, specific AppError using Horizon result codes. */
function mapSubmitError(e: unknown): AppError {
  const codes = extractResultCodes(e)
  if (codes) {
    const op = codes.operations?.[0]
    const tx = codes.transaction
    if (op === 'op_underfunded') {
      return {
        code: 'op_underfunded',
        message: 'Insufficient balance to send this amount plus the network fee.',
      }
    }
    if (op === 'op_no_destination') {
      return {
        code: 'op_no_destination',
        message: 'The destination account does not exist on Testnet — it must be a funded account.',
      }
    }
    if (tx === 'tx_bad_seq') {
      return {
        code: 'tx_bad_seq',
        message: 'Transaction is out of date (bad sequence). Refresh your balance and try again.',
      }
    }
    if (tx === 'tx_too_late') {
      return {
        code: 'tx_too_late',
        message: 'The transaction expired before it was submitted. Please try again.',
      }
    }
    if (tx === 'tx_insufficient_fee') {
      return { code: 'tx_insufficient_fee', message: 'Network fee too low right now. Please try again.' }
    }
    const detail = op ?? tx
    if (detail) {
      return { code: detail, message: `Transaction failed (${detail}).` }
    }
  }
  if (isTimeout(e)) {
    return {
      code: 'timeout',
      message:
        'The network timed out. Your transaction may not have gone through — check your balance before retrying.',
    }
  }
  const message = e instanceof Error ? e.message : 'The transaction could not be submitted.'
  return { code: 'submit_failed', message: `Transaction failed: ${message}` }
}

/** Safely pull Horizon's `result_codes` out of an unknown submission error. */
function extractResultCodes(
  e: unknown,
): { transaction?: string; operations?: string[] } | null {
  if (typeof e !== 'object' || e === null) {
    return null
  }
  const data = (
    e as {
      response?: { data?: { extras?: { result_codes?: { transaction?: string; operations?: string[] } } } }
    }
  ).response?.data
  return data?.extras?.result_codes ?? null
}

/** True when an error looks like a network/request timeout. */
function isTimeout(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) {
    return false
  }
  const err = e as { code?: string; message?: string }
  return err.code === 'ECONNABORTED' || /timeout/i.test(err.message ?? '')
}
