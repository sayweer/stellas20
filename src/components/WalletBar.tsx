/** Persistent balances strip: mUSDY / SY at a glance, plus the faucet. */
import type { ReactElement } from 'react'
import { formatAmount } from '../lib/format'
import { requestFaucet } from '../lib/contracts/mockToken'
import { useTxRunner } from '../hooks/useTxRunner'
import { FaucetButton, FAUCET_AMOUNT } from './FaucetButton'
import { TxStatus } from './TxStatus'
import { RefreshIcon, Spinner } from './icons'

interface WalletBarProps {
  address: string
  myt: bigint
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
  myt,
  sy,
  loading,
  isWrongNetwork,
  onRefresh,
}: WalletBarProps): ReactElement {
  const faucet = useTxRunner()

  function runFaucet(): void {
    void faucet.run('Faucet', (onPhase) => requestFaucet(address, FAUCET_AMOUNT, onPhase), onRefresh)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
        <div className="flex items-center gap-6">
          <Balance label="mUSDY" value={myt} loading={loading} />
          <Balance label="SY" value={sy} loading={loading} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <FaucetButton pending={faucet.pending} disabled={isWrongNetwork} onClick={runFaucet} />
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh balances"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-neutral-800 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:opacity-50"
          >
            {loading ? <Spinner className="h-4 w-4" /> : <RefreshIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {faucet.outcome && (
        <div className="mt-3">
          <TxStatus outcome={faucet.outcome} />
        </div>
      )}
    </div>
  )
}

function Balance({
  label,
  value,
  loading,
}: {
  label: string
  value: bigint
  loading: boolean
}): ReactElement {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">{label}</p>
      {loading ? (
        <div aria-hidden="true" className="mt-1 h-5 w-16 animate-pulse rounded bg-neutral-800" />
      ) : (
        <p className="truncate font-mono text-base font-semibold tabular-nums text-neutral-50">
          {formatAmount(value)}
        </p>
      )}
    </div>
  )
}
