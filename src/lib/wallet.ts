/**
 * StellarWalletsKit adapter: multi-wallet picker, session restore, and signing.
 * Sole point of contact with the kit — components and other services must
 * never import `@creit.tech/stellar-wallets-kit` directly.
 */
import { KitEventType, Networks as KitNetworks, StellarWalletsKit } from '@creit.tech/stellar-wallets-kit'
import { AlbedoModule } from '@creit.tech/stellar-wallets-kit/modules/albedo'
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter'
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull'
import type { AppError } from '../types'

// Albedo needs no install (web popup flow), so the picker always has at
// least one usable option even with no browser extension present.
const WALLET_MODULES = [new FreighterModule(), new xBullModule(), new AlbedoModule()]

StellarWalletsKit.init({
  modules: WALLET_MODULES,
  network: KitNetworks.TESTNET,
})

/** Result of a successful connection or session restore. */
export interface ConnectedWallet {
  address: string
}

/**
 * Open the kit's wallet-picker modal. Wallets that aren't installed are shown
 * with an "Install" link instead of a broken connection attempt; picking one
 * that's ready runs its native connect flow and resolves with the address.
 * @returns the connected address, or a friendly AppError if the user closed
 *   the modal or the wallet declined the connection.
 */
export async function openWalletPicker(): Promise<ConnectedWallet | AppError> {
  try {
    const { address } = await StellarWalletsKit.authModal()
    return { address }
  } catch (e) {
    return classifyKitError(e)
  }
}

/**
 * Restore a previously connected session from the kit's own persisted state
 * (no popup, no network call). Returns null if nothing was connected before.
 */
export async function restoreSession(): Promise<ConnectedWallet | null> {
  try {
    const { address } = await StellarWalletsKit.getAddress()
    return { address }
  } catch {
    return null
  }
}

/** Clear the kit's connection state (the underlying wallets expose no server-side disconnect). */
export function disconnectWallet(): void {
  void StellarWalletsKit.disconnect()
}

/**
 * Subscribe to the kit's connected-address changes. Fires immediately with
 * the current value (the kit persists it across reloads), then again on
 * every connect/disconnect/account switch.
 * @returns an unsubscribe function.
 */
export function onWalletAddressChange(callback: (address: string | null) => void): () => void {
  return StellarWalletsKit.on(KitEventType.STATE_UPDATED, (event) => {
    callback(event.payload.address ?? null)
  })
}

/**
 * Sign a transaction XDR with the currently selected wallet.
 * @returns the signed XDR, or a friendly AppError (e.g. the user declined,
 *   or the wallet is no longer available).
 */
export async function signXdr(
  xdr: string,
  opts: { address: string; networkPassphrase: string },
): Promise<string | AppError> {
  try {
    const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, opts)
    return signedTxXdr
  } catch (e) {
    return classifyKitError(e)
  }
}

/** Read the connected wallet's reported network, or null if it can't be determined. */
export async function getWalletNetwork(): Promise<
  { network: string; networkPassphrase: string } | null
> {
  try {
    return await StellarWalletsKit.getNetwork()
  } catch {
    return null
  }
}

/**
 * Map a StellarWalletsKit rejection (`{ code, message }`, an Error, or a raw
 * string) into a normalized AppError, classifying "the user backed out" and
 * "the wallet isn't reachable" by message content, with a generic fallback.
 */
function classifyKitError(e: unknown): AppError {
  const message = extractMessage(e).toLowerCase()
  if (
    message.includes('closed the modal') ||
    message.includes('declin') ||
    message.includes('reject') ||
    message.includes('denied') ||
    message.includes('cancel')
  ) {
    return { code: 'user_declined', message: 'You cancelled the wallet connection.' }
  }
  if (
    message.includes('not connected') ||
    message.includes('not installed') ||
    message.includes('not available')
  ) {
    return {
      code: 'wallet_not_found',
      message: 'The selected wallet is not available. Install it and try again.',
    }
  }
  return { code: 'wallet_error', message: extractMessage(e) || 'Unexpected wallet error.' }
}

/** Best-effort message extraction from an unknown thrown/rejected value. */
function extractMessage(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const message = (e as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return ''
}
