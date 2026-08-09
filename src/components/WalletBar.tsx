/** Persistent balances strip: underlying / SY at a glance, plus the faucet. */
import type { ReactElement } from 'react'
import { formatAmount } from '../lib/format'
import { activeMarket } from '../lib/market'
import { requestFaucet } from '../lib/contracts/underlying'
import { useTxRunner } from '../hooks/useTxRunner'
import { FaucetButton, FAUCET_AMOUNT } from './FaucetButton'
import { TxStatus } from './TxStatus'
import { IconButton } from './Button'
import { RefreshIcon } from './icons'
import { StellarMark } from './StellarMark'

interface WalletBarProps {
  address: string
  underlying: bigint
  sy: bigint
  loading: boolean
  isWrongNetwork: boolean
  onRefresh: () => void
}

/**
 * Compact, always-visible balances so every tab has spending context, with the
 * faucet one click away for the demo flow. The faucet's tx outcome renders
 * below the bar as a full TxStatus card, consistently with other actions.
 */
export function WalletBar({
  address,
  underlying,
  sy,
  loading,
  isWrongNetwork,
  onRefresh,
}: WalletBarProps): ReactElement {
  const faucet = useTxRunner()
  const market = activeMarket()

  function runFaucet(): void {
    if (faucet.blocked) return
    void faucet.run(
      'Faucet',
      (onPhase) => requestFaucet(address, FAUCET_AMOUNT, onPhase),
      onRefresh,
      `${formatAmount(FAUCET_AMOUNT)} ${market.underlyingSymbol}`,
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-hairline bg-neutral-900 px-4 py-3">
        <div className="flex items-center gap-6">
          <Balance
            label={market.underlyingSymbol}
            value={underlying}
            loading={loading}
            network={market.underlyingSymbol === 'XLM'}
          />
          <Balance label="SY" value={sy} loading={loading} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {market.source === 'mock' ? (
            <FaucetButton
              pending={faucet.pending}
              disabled={isWrongNetwork || faucet.blocked}
              onClick={runFaucet}
            />
          ) : (
            market.fundingHint && (
              <p className="max-w-xs text-xs text-neutral-400">{market.fundingHint}</p>
            )
          )}
          <IconButton
            label="Refresh balances"
            icon={<RefreshIcon className="h-4 w-4" />}
            onClick={onRefresh}
            pending={loading}
          />
        </div>
      </div>
      {faucet.outcome && (
        <div className="mt-3">
          <TxStatus outcome={faucet.outcome} onRetry={runFaucet} />
        </div>
      )}
      {loading ? (
        <span role="status" aria-live="polite" className="sr-only">
          Loading wallet balances
        </span>
      ) : null}
    </div>
  )
}

function Balance({
  label,
  value,
  loading,
  /** Marks the row that holds the network's own asset. */
  network = false,
}: {
  label: string
  value: bigint
  loading: boolean
  network?: boolean
}): ReactElement {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
        {network && <StellarMark className="h-3 w-3 shrink-0" />}
        {label}
      </p>
      {loading ? (
        <div aria-hidden="true" className="mt-1 h-5 w-16 animate-pulse rounded-full bg-raised" />
      ) : (
        <p className="truncate font-mono text-base font-semibold tabular-nums text-neutral-50">
          {formatAmount(value)}
        </p>
      )}
    </div>
  )
}
