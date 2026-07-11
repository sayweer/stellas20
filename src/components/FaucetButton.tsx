/** One-click faucet to mint demo mUSDY into the connected wallet. */
import type { ReactElement } from 'react'
import { requestFaucet } from '../lib/contracts/mockToken'
import { useTxRunner } from '../hooks/useTxRunner'
import { DropletIcon, Spinner } from './icons'

/** Faucet amount per click: 1,000 mUSDY (7 decimals). */
const FAUCET_AMOUNT = 1_000_0000000n

interface FaucetButtonProps {
  address: string
  disabled?: boolean
  onSuccess: () => void
}

export function FaucetButton({ address, disabled, onSuccess }: FaucetButtonProps): ReactElement {
  const { pending, run } = useTxRunner()

  return (
    <button
      type="button"
      onClick={() => {
        void run('Faucet', (onPhase) => requestFaucet(address, FAUCET_AMOUNT, onPhase), onSuccess)
      }}
      disabled={pending || disabled}
      aria-busy={pending}
      className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? <Spinner className="h-4 w-4" /> : <DropletIcon className="h-4 w-4 text-emerald-400" />}
      Get 1,000 mUSDY
    </button>
  )
}
