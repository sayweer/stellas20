/** Freighter wallet service: detect, connect/disconnect, read address + network, and sign transactions. */
import {
  isConnected as freighterIsConnected,
  isAllowed as freighterIsAllowed,
  requestAccess as freighterRequestAccess,
  setAllowed as freighterSetAllowed,
  getAddress as freighterGetAddress,
  getNetwork as freighterGetNetwork,
  getNetworkDetails as freighterGetNetworkDetails,
  signTransaction as freighterSignTransaction,
} from '@stellar/freighter-api'
import type { AppError } from '../types'

/** Result of a successful connection flow. */
interface ConnectedWallet {
  address: string
  network: string
  networkPassphrase: string
}

/**
 * Whether the Freighter browser extension is installed / available.
 * Wraps `isConnected()` and never throws — returns false on any failure.
 */
export async function isFreighterInstalled(): Promise<boolean> {
  try {
    const result = await freighterIsConnected()
    if (result.error) {
      return false
    }
    return result.isConnected
  } catch {
    return false
  }
}

/**
 * Whether the user has already authorized this app in Freighter (no popup).
 * Used to restore a session on reload. Returns false on any error.
 */
export async function isAllowed(): Promise<boolean> {
  try {
    const result = await freighterIsAllowed()
    if (result.error) {
      return false
    }
    return result.isAllowed
  } catch {
    return false
  }
}

/**
 * Run the full Freighter connection flow: confirm the extension is present,
 * `requestAccess()` (opens the popup), `setAllowed()`, then read the active
 * network via `getNetworkDetails()`.
 * @returns the connected address + network, or a friendly AppError.
 */
export async function connect(): Promise<ConnectedWallet | AppError> {
  try {
    if (!(await isFreighterInstalled())) {
      return {
        code: 'freighter_not_installed',
        message:
          'Freighter wallet was not detected. Install the Freighter extension, then try again.',
      }
    }

    const access = await freighterRequestAccess()
    if (access.error) {
      return classifyWalletError(access.error, 'access_denied', 'Could not connect to Freighter.')
    }

    const allowed = await freighterSetAllowed()
    if (allowed.error) {
      return classifyWalletError(
        allowed.error,
        'allow_failed',
        'Could not authorize this app in Freighter.',
      )
    }

    const details = await freighterGetNetworkDetails()
    if (details.error) {
      return classifyWalletError(
        details.error,
        'network_unavailable',
        'Connected, but could not read the wallet network.',
      )
    }

    return {
      address: access.address,
      network: details.network,
      networkPassphrase: details.networkPassphrase,
    }
  } catch (e) {
    return unexpectedWalletError(e)
  }
}

/**
 * The currently authorized account public key, or null if none / unavailable.
 * Does not open the connect popup.
 */
export async function getActiveAddress(): Promise<string | null> {
  try {
    const result = await freighterGetAddress()
    if (result.error || !result.address) {
      return null
    }
    return result.address
  } catch {
    return null
  }
}

/**
 * Read the wallet's current network name + passphrase.
 * @returns `{ network, networkPassphrase }`, or a friendly AppError.
 */
export async function getNetwork(): Promise<
  { network: string; networkPassphrase: string } | AppError
> {
  try {
    const result = await freighterGetNetwork()
    if (result.error) {
      return classifyWalletError(
        result.error,
        'network_unavailable',
        'Could not read the wallet network.',
      )
    }
    return { network: result.network, networkPassphrase: result.networkPassphrase }
  } catch (e) {
    return unexpectedWalletError(e)
  }
}

/**
 * Sign a transaction XDR with the active account via Freighter.
 * @param xdr - Unsigned transaction XDR.
 * @param networkPassphrase - Network the transaction targets.
 * @param address - Public key expected to sign.
 * @returns the signed transaction XDR, or a friendly AppError (e.g. user declined).
 */
export async function signXdr(
  xdr: string,
  networkPassphrase: string,
  address: string,
): Promise<string | AppError> {
  try {
    const result = await freighterSignTransaction(xdr, { networkPassphrase, address })
    if (result.error) {
      return classifyWalletError(result.error, 'sign_declined', 'Transaction signing was cancelled.')
    }
    return result.signedTxXdr
  } catch (e) {
    return unexpectedWalletError(e)
  }
}

/**
 * Map a Freighter error into a normalized AppError, classifying the common
 * "user declined" and "wallet locked" cases by message, with a context fallback.
 */
function classifyWalletError(
  raw: { message?: string },
  fallbackCode: string,
  fallbackMessage: string,
): AppError {
  const detail = (raw.message ?? '').toLowerCase()
  if (
    detail.includes('declin') ||
    detail.includes('denied') ||
    detail.includes('reject') ||
    detail.includes('cancel')
  ) {
    return { code: 'user_declined', message: 'You declined the request in Freighter.' }
  }
  if (detail.includes('lock')) {
    return {
      code: 'wallet_locked',
      message: 'Your Freighter wallet is locked. Unlock it and try again.',
    }
  }
  return { code: fallbackCode, message: fallbackMessage }
}

/** Wrap an unknown thrown value into a normalized AppError. */
function unexpectedWalletError(e: unknown): AppError {
  const message = e instanceof Error ? e.message : 'Unexpected wallet error.'
  return { code: 'wallet_error', message: `Wallet error: ${message}` }
}
