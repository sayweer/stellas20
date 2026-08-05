/** Wallet control: connect / connecting / connected (truncated address + copy + disconnect). */
import { useState } from 'react'
import type { ReactElement } from 'react'
import { useWallet } from '../context/WalletContext'
import { useTransactionSafety } from '../context/TransactionSafetyContext'
import { hasMobileWalletSupport, isMobileBrowser } from '../lib/wallet'
import { useToast } from '../hooks/useToast'
import { CheckIcon, CopyIcon, Spinner, XIcon } from './icons'

function truncate(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}

export function WalletButton(): ReactElement {
  const { status, address, isConnected, connect, disconnect } = useWallet()
  const { trackedTransaction } = useTransactionSafety()
  const { notify } = useToast()
  const [notFound, setNotFound] = useState(false)
  const [copied, setCopied] = useState(false)

  const connecting = status === 'connecting'

  async function handleConnect(): Promise<void> {
    setNotFound(false)
    const error = await connect()
    if (!error) return
    if (error.code === 'wallet_not_found') {
      setNotFound(true)
      return
    }
    // A declined connection is a state change, not an error — stay quiet.
    if (error.code === 'user_declined') return
    notify('error', error.message)
  }

  async function handleCopy(): Promise<void> {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      window.setTimeout(() => {
        setCopied(false)
      }, 1500)
    } catch {
      notify('error', 'Could not copy the address.')
    }
  }

  if (isConnected && address) {
    return (
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => {
            void handleCopy()
          }}
          aria-label={copied ? 'Address copied' : `Copy address ${address}`}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-boundary bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-200 transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
        >
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-positive-400" />
          <span className="tabular-nums">{truncate(address)}</span>
          {copied ? (
            <CheckIcon className="h-4 w-4 text-positive-400" />
          ) : (
            <CopyIcon className="h-4 w-4 text-neutral-500" />
          )}
        </button>
        <span role="status" aria-live="polite" className="sr-only">
          {copied ? 'Address copied.' : ''}
        </span>
        <button
          type="button"
          onClick={disconnect}
          disabled={trackedTransaction?.state === 'in_flight'}
          aria-label="Disconnect wallet"
          title={
            trackedTransaction?.state === 'in_flight'
              ? 'Wait for the active transaction to finish'
              : undefined
          }
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-boundary text-neutral-400 transition-colors hover:bg-raised hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:w-auto sm:px-3 sm:py-2 sm:text-sm sm:font-medium"
        >
          <span className="sm:hidden">
            <XIcon className="h-4 w-4" />
          </span>
          <span className="hidden sm:inline">Disconnect</span>
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => {
          void handleConnect()
        }}
        disabled={connecting}
        aria-busy={connecting}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-onAccent transition-colors duration-100 hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 active:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {connecting ? (
          <>
            <Spinner className="h-4 w-4" />
            Connecting…
          </>
        ) : (
          'Connect Wallet'
        )}
      </button>
      {notFound &&
        (isMobileBrowser() && !hasMobileWalletSupport() ? (
          /* "Install Freighter" is wrong advice on a phone: extensions cannot
             inject into a mobile browser, and Freighter's own module reports
             itself unavailable there on purpose. Telling someone who already
             has the app to install it again is why this looked broken. */
          <p role="alert" className="max-w-xs text-right text-xs text-neutral-400">
            Extension wallets can’t connect from a mobile browser — installing the app again won’t
            change that. Pick <span className="text-neutral-200">Albedo</span> in the wallet list,
            which works in any browser, or open this page on desktop.
          </p>
        ) : (
          <p role="alert" className="text-right text-xs text-neutral-400">
            No compatible wallet found. Install{' '}
            <a
              href="https://www.freighter.app/"
              target="_blank"
              rel="noreferrer"
              className="rounded font-medium text-accent-300 underline underline-offset-2 hover:text-accent-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
            >
              Freighter
            </a>{' '}
            and try again.
          </p>
        ))}
    </div>
  )
}
