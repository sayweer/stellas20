/** Split SY into PT+YT (and merge back), for a selected maturity. */
import { useState } from 'react'
import type { ReactElement } from 'react'
import { stroopsToXlm, xlmToStroops } from '../lib/amounts'
import { formatAmount } from '../lib/format'
import { mergePtYt, splitSy, type PositionView } from '../lib/contracts/splitter'
import type { MaturityPosition } from '../hooks/usePortfolio'
import { isValidTokenAmount } from '../lib/validation'
import { RATE_SCALE } from '../lib/yield'
import { useTxRunner } from '../hooks/useTxRunner'
import { SplitIcon } from './icons'
import { TxStatus } from './TxStatus'
import { AmountField, TabToggle, ActionButton } from './forms'
import { MaturitySelect } from './MaturitySelect'

interface SplitCardProps {
  address: string
  syBalance: bigint
  positions: MaturityPosition[]
  liveRate: bigint | null
  isWrongNetwork: boolean
  onSuccess: () => void
}

type Tab = 'split' | 'merge'

const ZERO_POSITION: PositionView = { pt: 0n, yt: 0n, reserveSy: 0n, accruedSy: 0n }

export function SplitCard({
  address,
  syBalance,
  positions,
  liveRate,
  isWrongNetwork,
  onSuccess,
}: SplitCardProps): ReactElement {
  const [tab, setTab] = useState<Tab>('split')
  const [amount, setAmount] = useState('')
  const [maturity, setMaturity] = useState<bigint | null>(positions[0]?.maturity ?? null)
  const { outcome, pending, run } = useTxRunner()

  // Keep a valid selection as maturities load.
  const selected = maturity ?? positions[0]?.maturity ?? null
  const position =
    positions.find((p) => p.maturity === selected)?.position ?? ZERO_POSITION

  const balance = tab === 'split' ? syBalance : position.pt
  const balanceNum = Number(stroopsToXlm(balance))
  const valid = isValidTokenAmount(amount, balanceNum, { label: tab === 'split' ? 'SY' : 'PT' })

  // Client-side floor preview of the PT/YT that a split would mint.
  let preview: bigint | null = null
  if (tab === 'split' && liveRate !== null && valid.ok && amount.trim() !== '') {
    preview = (xlmToStroops(amount.trim()) * liveRate) / RATE_SCALE
  }

  function submit(): void {
    if (!valid.ok || pending || selected === null) return
    const stroops = xlmToStroops(amount.trim())
    const label = tab === 'split' ? 'Split' : 'Merge'
    void run(
      label,
      (onPhase) =>
        tab === 'split'
          ? splitSy(address, selected, stroops, onPhase)
          : mergePtYt(address, selected, stroops, onPhase),
      () => {
        setAmount('')
        onSuccess()
      },
    )
  }

  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <SplitIcon className="h-4 w-4 text-neutral-400" />
        <h2 className="text-sm font-medium text-neutral-400">Split / Merge</h2>
      </div>

      {positions.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">
          No maturities are available yet. The admin must create one before you can split.
        </p>
      ) : (
        <>
          <div className="mt-4">
            <MaturitySelect
              maturities={positions.map((p) => p.maturity)}
              value={selected}
              onChange={setMaturity}
            />
          </div>

          <TabToggle
            className="mt-4"
            options={[
              { id: 'split', label: 'Split → PT + YT' },
              { id: 'merge', label: 'Merge → SY' },
            ]}
            active={tab}
            onChange={(id) => {
              setTab(id as Tab)
              setAmount('')
            }}
          />

          <div className="mt-4">
            <AmountField
              id="split-amount"
              value={amount}
              onChange={setAmount}
              unit={tab === 'split' ? 'SY' : 'PT'}
              hint={
                tab === 'split'
                  ? `Available: ${formatAmount(syBalance)} SY`
                  : `Your PT: ${formatAmount(position.pt)}`
              }
              error={amount.trim() !== '' && !valid.ok ? valid.reason : null}
              onEnter={submit}
            />
          </div>

          {preview !== null && (
            <p className="mt-2 text-xs text-neutral-400">
              You’ll receive ≈ <span className="font-mono text-emerald-300">{formatAmount(preview)}</span>{' '}
              PT and the same amount of YT.
            </p>
          )}

          <ActionButton
            className="mt-4"
            onClick={submit}
            disabled={isWrongNetwork || !valid.ok}
            pending={pending}
            pendingLabel={tab === 'split' ? 'Splitting…' : 'Merging…'}
          >
            {tab === 'split' ? 'Split SY' : 'Merge back to SY'}
          </ActionButton>

          {isWrongNetwork && (
            <p className="mt-3 text-center text-xs text-amber-300">
              Switch your wallet to Testnet to continue.
            </p>
          )}

          {outcome && (
            <div className="mt-5">
              <TxStatus outcome={outcome} />
            </div>
          )}
        </>
      )}
    </section>
  )
}
