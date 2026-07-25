/**
 * Wrap the market's underlying into SY (and unwrap back), driving the tx
 * lifecycle.
 *
 * The two vaults mint differently and the UI has to say so: the mock vault
 * wraps 1:1 (value lives in the rising rate), while the Blend-backed vault
 * issues bTokens, so a deposit buys `amount / rate` SY. The preview line below
 * the field is the only place a user can see that before signing.
 */
import { useState } from 'react'
import type { ReactElement } from 'react'
import { stroopsToXlm } from '../lib/amounts'
import { formatAmount } from '../lib/format'
import { activeMarket } from '../lib/market'
import { RATE_SCALE } from '../lib/yield'
import { unwrapTokens, wrapTokens } from '../lib/contracts/syVault'
import { isValidTokenAmount } from '../lib/validation'
import { useTxRunner } from '../hooks/useTxRunner'
import { LayersIcon } from './icons'
import { TxStatus } from './TxStatus'
import { AmountField, TabToggle, ActionButton } from './forms'

interface WrapCardProps {
  address: string
  underlyingBalance: bigint
  syBalance: bigint
  /** Current SY exchange rate (scaled by 1e12), or null while unknown. */
  liveRate: bigint | null
  loading: boolean
  isWrongNetwork: boolean
  onSuccess: () => void
}

type Tab = 'wrap' | 'unwrap'

export function WrapCard({
  address,
  underlyingBalance,
  syBalance,
  liveRate,
  loading,
  isWrongNetwork,
  onSuccess,
}: WrapCardProps): ReactElement {
  const [tab, setTab] = useState<Tab>('wrap')
  const [amount, setAmount] = useState('')
  const { outcome, pending, run, reset } = useTxRunner()

  const market = activeMarket()
  const underlyingSymbol = market.underlyingSymbol
  const inputUnit = tab === 'wrap' ? underlyingSymbol : 'SY'
  const outputUnit = tab === 'wrap' ? 'SY' : underlyingSymbol
  const balance = tab === 'wrap' ? underlyingBalance : syBalance
  const valid = isValidTokenAmount(amount, balance, { label: inputUnit })

  // Shares are 1:1 with the underlying on the mock vault; on a Blend-backed
  // vault they are bTokens, so the rate converts between the two.
  const preview =
    !valid.ok || market.source === 'mock' || liveRate === null || liveRate === 0n
      ? null
      : tab === 'wrap'
        ? (valid.stroops * RATE_SCALE) / liveRate
        : (valid.stroops * liveRate) / RATE_SCALE

  function submit(): void {
    if (!valid.ok || pending) return
    const stroops = valid.stroops
    const label = tab === 'wrap' ? 'Wrap' : 'Unwrap'
    void run(
      label,
      (onPhase) =>
        tab === 'wrap'
          ? wrapTokens(address, stroops, onPhase)
          : unwrapTokens(address, stroops, onPhase),
      () => {
        setAmount('')
        onSuccess()
      },
    )
  }

  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <LayersIcon className="h-4 w-4 text-neutral-400" />
        <h2 className="text-sm font-medium text-neutral-400">Wrap / Unwrap</h2>
      </div>

      <TabToggle
        className="mt-4"
        label="Wrap or unwrap mode"
        options={[
          { id: 'wrap', label: 'Wrap → SY' },
          { id: 'unwrap', label: `Unwrap → ${underlyingSymbol}` },
        ]}
        active={tab}
        onChange={(id) => {
          setTab(id as Tab)
          setAmount('')
          reset()
        }}
      />

      <div className="mt-4">
        <AmountField
          id="wrap-amount"
          value={amount}
          onChange={setAmount}
          unit={inputUnit}
          hint={loading ? 'Loading balances…' : `Available: ${formatAmount(balance)} ${inputUnit}`}
          error={amount.trim() !== '' && !valid.ok ? valid.reason : null}
          onEnter={submit}
          onMax={
            balance > 0n
              ? () => {
                  setAmount(stroopsToXlm(balance))
                }
              : undefined
          }
        />
      </div>

      {preview !== null && (
        <p className="mt-2 text-xs text-neutral-400">
          You receive ≈{' '}
          <span className="font-mono tabular-nums text-neutral-200">{formatAmount(preview)}</span>{' '}
          {outputUnit}
        </p>
      )}

      <ActionButton
        className="mt-4"
        onClick={submit}
        disabled={isWrongNetwork || !valid.ok}
        pending={pending}
        pendingLabel={tab === 'wrap' ? 'Wrapping…' : 'Unwrapping…'}
      >
        {tab === 'wrap' ? 'Wrap into SY' : `Unwrap to ${underlyingSymbol}`}
      </ActionButton>

      {isWrongNetwork && (
        <p className="mt-3 text-center text-xs text-amber-300">Switch your wallet to Testnet to continue.</p>
      )}

      {outcome && (
        <div className="mt-5">
          <TxStatus outcome={outcome} />
        </div>
      )}
    </section>
  )
}
