/** Wallet control: connect / connecting / connected (truncated address + copy + disconnect). */
import { useState } from 'react'
import type { ReactElement } from 'react'
import { useWallet } from '../context/WalletContext'
import { useToast } from '../hooks/useToast'
import { CheckIcon, CopyIcon, Spinner, XIcon } from './icons'

function truncate(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}

export function WalletButton(): ReactElement {
  const { status, address, isConnected, connect, disconnect } = useWallet()
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
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-200 transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60"
          />
          <span className="tabular-nums">{truncate(address)}</span>
          {copied ? (
            <CheckIcon className="h-4 w-4 text-emerald-400" />
          ) : (
            <CopyIcon className="h-4 w-4 text-neutral-500" />
          )}
        </button>
        <button
          type="button"
          onClick={disconnect}
          aria-label="Disconnect wallet"
          className="grid h-9 w-9 place-items-center rounded-lg border border-neutral-800 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 sm:h-auto sm:w-auto sm:px-3 sm:py-2 sm:text-sm sm:font-medium"
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
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 active:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
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
      {notFound && (
        <p role="alert" className="text-right text-xs text-neutral-400">
          No compatible wallet found. Install{' '}
          <a
            href="https://www.freighter.app/"
            target="_blank"
            rel="noreferrer"
            className="rounded font-medium text-emerald-400 underline underline-offset-2 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
          >
            Freighter
          </a>{' '}
          and try again.
        </p>
      )}
    </div>
  )
}
