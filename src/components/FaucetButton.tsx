/** Presentational faucet button — the tx runner lives in the parent so its
 * outcome (hash + explorer link, persistent errors) can be rendered as a
 * TxStatus card, consistently with the other write actions. */
import type { ReactElement } from 'react'
import { activeMarket } from '../lib/market'
import { DropletIcon } from './icons'
import { Button } from './Button'

/** Faucet amount per click: 1,000 tokens (7 decimals). */
export const FAUCET_AMOUNT = 1_000_0000000n

interface FaucetButtonProps {
  pending: boolean
  disabled?: boolean
  onClick: () => void
}

export function FaucetButton({ pending, disabled, onClick }: FaucetButtonProps): ReactElement {
  return (
    <Button
      variant="secondary"
      onClick={onClick}
      disabled={disabled}
      pending={pending}
      pendingLabel={`Sending 1,000 ${activeMarket().underlyingSymbol}…`}
    >
      <DropletIcon className="h-4 w-4 text-accent-400" />
      Get 1,000 {activeMarket().underlyingSymbol}
    </Button>
  )
}
