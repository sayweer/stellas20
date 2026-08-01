/**
 * StellarWalletsKit adapter: multi-wallet picker, session restore, and signing.
 * Sole point of contact with the kit — components and other services must
 * never import `@creit.tech/stellar-wallets-kit` directly.
 */
import { KitEventType, Networks as KitNetworks, StellarWalletsKit } from '@creit.tech/stellar-wallets-kit'
import { AlbedoModule } from '@creit.tech/stellar-wallets-kit/modules/albedo'
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter'
import { LobstrModule } from '@creit.tech/stellar-wallets-kit/modules/lobstr'
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull'
import * as Sentry from '@sentry/react'
import { config } from '../config'
import type { AppError } from '../types'

/** Wallets that reach the page through a browser extension. */
const EXTENSION_MODULES = [new FreighterModule(), new xBullModule(), new LobstrModule()]

/**
 * Wallets that need no install at all (Albedo is a web popup flow), so the
 * picker always has at least one usable option with no extension present.
 */
const WEB_MODULES = [new AlbedoModule()]

/**
 * True on a phone/tablet browser. Used to explain *why* an extension wallet
 * cannot connect there rather than leaving the kit's "Install" link looking
 * broken to someone who already has the app.
 */
export function isMobileBrowser(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/**
 * True inside a wallet app's own in-app browser, which does inject a provider
 * even though the platform is mobile — the one case where an "extension"
 * wallet is reachable from a phone.
 */
function hasInjectedProvider(): boolean {
  return 'stellar' in window
}

/** Whether a phone can actually reach a wallet — i.e. WalletConnect is configured. */
export function hasMobileWalletSupport(): boolean {
  return config.walletConnectProjectId !== ''
}

/**
 * Extension wallets cannot inject into a mobile browser, so on a phone they are
 * not registered at all. Listing them is worse than useless: Freighter's module
 * reports `isAvailable() === false` there on purpose (its source says to use
 * WalletConnect instead), and the picker turns that into an "Install" badge that
 * opens the app store — an endless loop for someone who already has the app.
 * xBull is the mirror image: it claims to be available everywhere and then fails
 * on selection, because its iframe bridge cannot run on a phone.
 *
 * A wallet app's own in-app browser does inject a provider, so that case keeps
 * the full list.
 */
const baseModules =
  isMobileBrowser() && !hasInjectedProvider()
    ? WEB_MODULES
    : [...EXTENSION_MODULES, ...WEB_MODULES]

/**
 * WalletConnect is the only route to a wallet held in a phone's own app, and is
 * what Freighter mobile expects — inside Freighter's in-app browser its module
 * even takes over the picker and connects directly.
 *
 * Its AppKit bundle is ~120 kB gzipped and awaited before the app can start, so
 * it is loaded dynamically and only where it changes the outcome: a phone, and
 * only once a project id is configured. Desktop reaches the same wallets
 * through an extension and does not pay for it.
 */
const modules = await (async () => {
  if (!config.walletConnectProjectId || !isMobileBrowser()) return baseModules
  try {
    const { WalletConnectModule, WalletConnectTargetChain } = await import(
      '@creit.tech/stellar-wallets-kit/modules/wallet-connect'
    )
    return [
      ...baseModules,
      new WalletConnectModule({
        projectId: config.walletConnectProjectId,
        allowedChains: [WalletConnectTargetChain.TESTNET],
        metadata: {
          name: 'Everspan',
          description: 'Lock a fixed yield on Stellar',
          url: window.location.origin,
          icons: [`${window.location.origin}/icon-512.png`],
        },
      }),
    ]
  } catch {
    // A misconfigured project id must not take the whole picker down.
    return baseModules
  }
})()

StellarWalletsKit.init({
  modules,
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
  // A browser extension cannot inject into a mobile browser. Freighter's module
  // says so via `isAvailable()`, but the others report themselves available and
  // then fail once selected — xBull surfaces it as `no elements in sequence`,
  // which was being shown to the user verbatim. On a phone this is the
  // overwhelmingly likely cause of an otherwise unrecognized picker failure, so
  // name the real constraint and point at what does work. It is a platform
  // limitation rather than a defect, so it does not belong in Sentry either.
  if (isMobileBrowser()) {
    return {
      code: 'wallet_not_found',
      message: hasMobileWalletSupport()
        ? 'That wallet needs a browser extension, which mobile browsers can’t run. Use WalletConnect or Albedo instead.'
        : 'That wallet needs a browser extension, which mobile browsers can’t run. Albedo works in any browser — or open this page on a desktop.',
    }
  }
  if (config.sentryDsn) {
    Sentry.captureException(e)
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
