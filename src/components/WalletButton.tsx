/** Wallet control: connect / connecting / connected (truncated address + copy + disconnect). */
import { useState } from 'react'
import type { ReactElement } from 'react'
import { useWallet } from '../context/WalletContext'
import { useTransactionSafety } from '../context/TransactionSafetyContext'
import { hasMobileWalletSupport, isMobileBrowser } from '../lib/wallet'
import { useToast } from '../hooks/useToast'
import { buttonClasses } from '../lib/buttonStyles'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { CheckIcon, ChevronDownIcon, CopyIcon } from './icons'

function truncate(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}

export function WalletButton(): ReactElement {
  const { status, address, isConnected, connect, disconnect } = useWallet()
  const { trackedTransaction } = useTransactionSafety()
  const { notify } = useToast()
  const [notFound, setNotFound] = useState(false)
  const [copied, setCopied] = useState(false)
  const [walletSheetOpen, setWalletSheetOpen] = useState(false)

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
      <>
        {/*
         * On a phone the connected wallet is one chip that opens a sheet. As
         * three separate controls — address, copy, disconnect — it was 194px of
         * a 288px header, which is what pushed everything else onto a second
         * and third line.
         */}
        <button
          id="wallet-trigger"
          type="button"
          aria-haspopup="dialog"
          aria-expanded={walletSheetOpen}
          onClick={() => {
            setWalletSheetOpen(true)
          }}
          className={`${buttonClasses({ variant: 'secondary' })} min-w-0 font-mono lg:hidden`}
        >
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-positive-400" />
          <span className="truncate tabular-nums">{truncate(address)}</span>
          <ChevronDownIcon className="h-4 w-4 shrink-0 text-neutral-400" />
        </button>

        <BottomSheet
          open={walletSheetOpen}
          onClose={() => {
            setWalletSheetOpen(false)
          }}
          title="Wallet"
        >
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-neutral-400">Address</p>
              <p className="mt-2 break-all font-mono text-sm text-neutral-100">{address}</p>
            </div>
            <Button
              variant="secondary"
              full
              onClick={() => {
                void handleCopy()
              }}
            >
              {copied ? (
                <CheckIcon className="h-4 w-4 text-positive-400" />
              ) : (
                <CopyIcon className="h-4 w-4" />
              )}
              {copied ? 'Copied' : 'Copy address'}
            </Button>
            <Button
              variant="danger"
              full
              onClick={() => {
                setWalletSheetOpen(false)
                disconnect()
              }}
              disabled={trackedTransaction?.state === 'in_flight'}
              title={
                trackedTransaction?.state === 'in_flight'
                  ? 'Wait for the active transaction to finish'
                  : undefined
              }
            >
              Disconnect
            </Button>
          </div>
        </BottomSheet>

        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <Button
            variant="secondary"
            onClick={() => {
              void handleCopy()
            }}
            aria-label={copied ? 'Address copied' : `Copy address ${address}`}
            className="font-mono"
          >
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-positive-400" />
            <span className="tabular-nums">{truncate(address)}</span>
            {copied ? (
              <CheckIcon className="h-4 w-4 text-positive-400" />
            ) : (
              <CopyIcon className="h-4 w-4 text-neutral-500" />
            )}
          </Button>
          <Button
            variant="secondary"
            onClick={disconnect}
            disabled={trackedTransaction?.state === 'in_flight'}
            title={
              trackedTransaction?.state === 'in_flight'
                ? 'Wait for the active transaction to finish'
                : undefined
            }
          >
            Disconnect
          </Button>
        </div>

        <span role="status" aria-live="polite" className="sr-only">
          {copied ? 'Address copied.' : ''}
        </span>
      </>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        variant="primary"
        onClick={() => {
          void handleConnect()
        }}
        pending={connecting}
        pendingLabel="Connecting…"
      >
        Connect Wallet
      </Button>
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
              className="rounded font-medium text-accent-300 underline underline-offset-2 hover:text-accent-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-300"
            >
              Freighter
            </a>{' '}
            and try again.
          </p>
        ))}
    </div>
  )
}
