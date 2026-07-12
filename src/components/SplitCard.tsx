/** Split SY into PT+YT (and merge back), for a selected maturity. */
import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { stroopsToXlm } from '../lib/amounts'
import { formatAmount } from '../lib/format'
import { mergePtYt, splitSy, type PositionView } from '../lib/contracts/splitter'
import type { MaturityPosition } from '../hooks/usePortfolio'
import { isValidTokenAmount } from '../lib/validation'
import { chainNowMs } from '../lib/chainTime'
import { RATE_SCALE } from '../lib/yield'
import { useTxRunner } from '../hooks/useTxRunner'
import { SplitIcon } from './icons'
import { TxStatus } from './TxStatus'
import { AmountField, TabToggle, ActionButton } from './forms'
import { MaturitySelect, type MaturityOption } from './MaturitySelect'

interface SplitCardProps {
  address: string
  syBalance: bigint
  positions: MaturityPosition[]
  liveRate: bigint | null
  loading: boolean
  isWrongNetwork: boolean
  onSuccess: () => void
}

type Tab = 'split' | 'merge'

const ZERO_POSITION: PositionView = { pt: 0n, yt: 0n, reserveSy: 0n, accruedSy: 0n }

function isMatured(maturity: bigint, nowMs: number): boolean {
  return Number(maturity) * 1000 <= nowMs
}

export function SplitCard({
  address,
  syBalance,
  positions,
  liveRate,
  loading,
  isWrongNetwork,
  onSuccess,
}: SplitCardProps): ReactElement {
  const [tab, setTab] = useState<Tab>('split')
  const [amount, setAmount] = useState('')
  const [maturity, setMaturity] = useState<bigint | null>(null)
  const [nowMs, setNowMs] = useState(() => chainNowMs())
  const { outcome, pending, run, reset } = useTxRunner()

  useEffect(() => {
    const t = window.setInterval(() => {
      setNowMs(chainNowMs())
    }, 1000)
    return () => {
      window.clearInterval(t)
    }
  }, [])

  const options: MaturityOption[] = positions.map((p) => ({
    maturity: p.maturity,
    matured: isMatured(p.maturity, nowMs),
  }))
  // Prefer the user's pick if it still exists; else the first active maturity; else the first.
  const firstActive = options.find((o) => !o.matured)?.maturity
  const selected =
    maturity !== null && positions.some((p) => p.maturity === maturity)
      ? maturity
      : (firstActive ?? positions[0]?.maturity ?? null)
  const selectedMatured = selected !== null && isMatured(selected, nowMs)
  const position = positions.find((p) => p.maturity === selected)?.position ?? ZERO_POSITION

  const balance = tab === 'split' ? syBalance : position.pt
  const valid = isValidTokenAmount(amount, balance, { label: tab === 'split' ? 'SY' : 'PT' })

  // Client-side floor preview of what the action produces: PT/YT from a split
  // (sy·rate/SCALE), or SY from a merge (pt·SCALE/rate) — merge isn't 1:1 as the
  // rate grows, so the estimate is genuinely useful before signing.
  const preview =
    !selectedMatured && liveRate !== null && valid.ok
      ? tab === 'split'
        ? (valid.stroops * liveRate) / RATE_SCALE
        : (valid.stroops * RATE_SCALE) / liveRate
      : null

  function switchTab(id: Tab): void {
    setTab(id)
    setAmount('')
    reset()
  }

  function submit(): void {
    if (!valid.ok || pending || selected === null || selectedMatured) return
    const stroops = valid.stroops
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
        <p className="mt-4 text-sm text-neutral-400">
          No maturities are available yet. The admin must create one before you can split.
        </p>
      ) : (
        <>
          <div className="mt-4">
            <MaturitySelect
              options={options}
              value={selected}
              onChange={(m) => {
                setMaturity(m)
                reset()
              }}
            />
          </div>

          <TabToggle
            className="mt-4"
            label="Split or merge mode"
            options={[
              { id: 'split', label: 'Split → PT + YT' },
              { id: 'merge', label: 'Merge → SY' },
            ]}
            active={tab}
            onChange={(id) => {
              switchTab(id as Tab)
            }}
          />

          <div className="mt-4">
            <AmountField
              id="split-amount"
              value={amount}
              onChange={setAmount}
              unit={tab === 'split' ? 'SY' : 'PT'}
              hint={
                loading
                  ? 'Loading balances…'
                  : tab === 'split'
                    ? `Available: ${formatAmount(syBalance)} SY`
                    : `Your PT: ${formatAmount(position.pt)}`
              }
              error={amount.trim() !== '' && !valid.ok ? valid.reason : null}
              onEnter={submit}
              disabled={selectedMatured}
              onMax={
                !selectedMatured && balance > 0n
                  ? () => {
                      setAmount(stroopsToXlm(balance))
                    }
                  : undefined
              }
            />
          </div>

          {/* Reserve the line so the submit button doesn't jump as validity toggles. */}
          <p className="mt-2 min-h-[1rem] text-xs text-neutral-400">
            {preview !== null &&
              (tab === 'split' ? (
                <>
                  You’ll receive ≈{' '}
                  <span className="font-mono text-emerald-300">{formatAmount(preview)}</span> PT and the
                  same amount of YT.
                </>
              ) : (
                <>
                  You’ll receive ≈{' '}
                  <span className="font-mono text-emerald-300">{formatAmount(preview)}</span> SY.
                </>
              ))}
          </p>

          <ActionButton
            className="mt-4"
            onClick={submit}
            disabled={isWrongNetwork || selectedMatured || !valid.ok}
            pending={pending}
            pendingLabel={tab === 'split' ? 'Splitting…' : 'Merging…'}
          >
            {tab === 'split' ? 'Split SY' : 'Merge back to SY'}
          </ActionButton>

          {selectedMatured ? (
            <p className="mt-3 text-center text-xs text-amber-300">
              This maturity has passed — split and merge are closed. Claim or redeem it under “Your
              positions”.
            </p>
          ) : (
            isWrongNetwork && (
              <p className="mt-3 text-center text-xs text-amber-300">
                Switch your wallet to Testnet to continue.
              </p>
            )
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
