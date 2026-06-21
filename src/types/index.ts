/** Shared TypeScript types used across the app. */

/** Lifecycle of the wallet connection. */
export type WalletStatus = 'disconnected' | 'connecting' | 'connected'

/** Current wallet connection state. */
export interface WalletState {
  status: WalletStatus
  /** Connected account public key, or null when disconnected. */
  address: string | null
  /** Network name reported by the wallet (e.g. 'TESTNET'), or null when unknown. */
  network: string | null
  /** Network passphrase reported by the wallet, or null when unknown. */
  networkPassphrase: string | null
}

/** Native XLM balance for the connected account. */
export interface BalanceInfo {
  /** Native XLM balance as a string (Stellar amounts are strings). */
  xlm: string
  /** False when the account does not yet exist on-chain (unfunded). */
  funded: boolean
}

/** User-submitted payment intent, before validation/building. */
export interface PaymentRequest {
  destination: string
  /** Amount in XLM as a string, up to 7 decimals. */
  amount: string
  /** Optional text memo. */
  memo?: string
}

/** Result of submitting a payment transaction. */
export interface TxResult {
  hash: string
  success: boolean
}

/** Normalized, UI-safe error. Library errors are mapped into this shape. */
export interface AppError {
  /** Stable machine-readable code (e.g. 'op_underfunded', 'wallet_locked'). */
  code: string
  /** Friendly, specific message safe to show the user. */
  message: string
}

/**
 * Runtime type guard distinguishing a normalized {@link AppError} from a
 * successful service result. Service-layer functions return `Result | AppError`.
 */
export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof (value as Record<string, unknown>).code === 'string' &&
    typeof (value as Record<string, unknown>).message === 'string'
  )
}
