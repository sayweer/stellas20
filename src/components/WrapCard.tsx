/** Wrap mUSDY into SY (and unwrap back), driving the tx lifecycle. */
import { useState } from 'react'
import type { ReactElement } from 'react'
import { stroopsToXlm } from '../lib/amounts'
import { formatAmount } from '../lib/format'
import { unwrapTokens, wrapTokens } from '../lib/contracts/syVault'
import { isValidTokenAmount } from '../lib/validation'
import { useTxRunner } from '../hooks/useTxRunner'
import { LayersIcon } from './icons'
import { TxStatus } from './TxStatus'
import { AmountField, TabToggle, ActionButton } from './forms'

interface WrapCardProps {
  address: string
  mytBalance: bigint
  syBalance: bigint
  loading: boolean
  isWrongNetwork: boolean
  onSuccess: () => void
}

type Tab = 'wrap' | 'unwrap'

export function WrapCard({
  address,
  mytBalance,
  syBalance,
  loading,
  isWrongNetwork,
  onSuccess,
}: WrapCardProps): ReactElement {
  const [tab, setTab] = useState<Tab>('wrap')
  const [amount, setAmount] = useState('')
  const { outcome, pending, run, reset } = useTxRunner()

  const balance = tab === 'wrap' ? mytBalance : syBalance
  const valid = isValidTokenAmount(amount, balance, { label: tab === 'wrap' ? 'mUSDY' : 'SY' })

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
        options={[
          { id: 'wrap', label: 'Wrap → SY' },
          { id: 'unwrap', label: 'Unwrap → mUSDY' },
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
          unit={tab === 'wrap' ? 'mUSDY' : 'SY'}
          hint={
            loading
              ? 'Loading balances…'
              : `Available: ${formatAmount(balance)} ${tab === 'wrap' ? 'mUSDY' : 'SY'}`
          }
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

      <ActionButton
        className="mt-4"
        onClick={submit}
        disabled={isWrongNetwork || !valid.ok}
        pending={pending}
        pendingLabel={tab === 'wrap' ? 'Wrapping…' : 'Unwrapping…'}
      >
        {tab === 'wrap' ? 'Wrap into SY' : 'Unwrap to mUSDY'}
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
