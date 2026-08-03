/** Presentational faucet button — the tx runner lives in the parent so its
 * outcome (hash + explorer link, persistent errors) can be rendered as a
 * TxStatus card, consistently with the other write actions. */
import type { ReactElement } from 'react'
import { activeMarket } from '../lib/market'
import { DropletIcon, Spinner } from './icons'

/** Faucet amount per click: 1,000 tokens (7 decimals). */
export const FAUCET_AMOUNT = 1_000_0000000n

interface FaucetButtonProps {
  pending: boolean
  disabled?: boolean
  onClick: () => void
}

export function FaucetButton({ pending, disabled, onClick }: FaucetButtonProps): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || disabled}
      aria-busy={pending}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-boundary px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <Spinner className="h-4 w-4" />
      ) : (
        <DropletIcon className="h-4 w-4 text-accent-400" />
      )}
      Get 1,000 {activeMarket().underlyingSymbol}
    </button>
  )
}
