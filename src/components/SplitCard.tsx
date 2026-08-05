/** Split SY into PT+YT (and merge back), for a selected maturity. */
import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { stroopsToXlm } from '../lib/amounts'
import { formatAmount, formatMaturity } from '../lib/format'
import { mergePtYt, splitSy, type AccountView } from '../lib/contracts/splitter'
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

const ZERO_POSITION: AccountView = { pt: 0n, yt: 0n, index: 0n, accruedSy: 0n, claimable: 0n }

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
  const { outcome, pending, blocked, run, reset } = useTxRunner()

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

  // A merge burns PT *and* YT in equal parts, so the ceiling is whichever the
  // holder has less of. Validating against PT alone let anyone who had sold or
  // transferred their YT submit a merge that could only fail on chain
  // (SplitterError::InsufficientYt), paying the fee to find out.
  const mergeable = position.pt < position.yt ? position.pt : position.yt
  const balance = tab === 'split' ? syBalance : mergeable
  const valid = isValidTokenAmount(amount, balance, {
    label: tab === 'split' ? 'SY' : 'PT + YT',
  })

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
    if (!valid.ok || pending || blocked || selected === null || selectedMatured) return
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
      `${formatAmount(stroops)} ${tab === 'split' ? 'SY' : 'PT + YT'} · ${formatMaturity(selected)}`,
    )
  }

  return (
    <section className="rounded-2xl border border-hairline bg-neutral-900 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <SplitIcon className="h-4 w-4 text-neutral-400" />
        <h2 className="text-sm font-medium text-neutral-100">Separate principal and yield</h2>
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
              { id: 'split', label: 'Separate into PT + YT' },
              { id: 'merge', label: 'Recombine into SY' },
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
                    : `Your PT: ${formatAmount(position.pt)} · YT: ${formatAmount(position.yt)}`
              }
              error={amount.trim() !== '' && !valid.ok ? valid.reason : null}
              onEnter={submit}
              disabled={selectedMatured || blocked}
              onMax={
                !selectedMatured && !blocked && balance > 0n
                  ? () => {
                      setAmount(stroopsToXlm(balance))
                    }
                  : undefined
              }
            />
          </div>

          {preview !== null && valid.ok && (
            <div className="mt-4 rounded-xl border border-hairline bg-neutral-950/40 p-4">
              <p className="text-sm font-semibold text-neutral-100">
                {tab === 'split' ? 'Review separation' : 'Review recombination'}
              </p>
              <div className="mt-3 space-y-2 text-sm">
                <p className="flex items-center justify-between gap-4">
                  <span className="text-neutral-400">You use</span>
                  <span className="font-mono tabular-nums text-neutral-200">
                    {formatAmount(valid.stroops)} {tab === 'split' ? 'SY' : 'PT + YT'}
                  </span>
                </p>
                <p className="flex items-center justify-between gap-4">
                  <span className="text-neutral-400">You receive</span>
                  <span className="text-right font-mono font-medium tabular-nums text-neutral-100">
                    {tab === 'split'
                      ? `≈ ${formatAmount(preview)} PT + ${formatAmount(preview)} YT`
                      : `≈ ${formatAmount(preview)} SY`}
                  </span>
                </p>
              </div>
              <p className="mt-3 border-t border-hairline pt-3 text-xs leading-relaxed text-neutral-400">
                {tab === 'split'
                  ? 'One SY position becomes matching principal and yield positions with the same maturity. Separating alone does not create extra value.'
                  : 'Matching PT and YT are burned together and returned as SY. Your wallet shows the final network fee before approval.'}
              </p>
            </div>
          )}

          <ActionButton
            className="mt-4"
            onClick={submit}
            disabled={isWrongNetwork || selectedMatured || blocked || !valid.ok}
            pending={pending}
            pendingLabel={tab === 'split' ? 'Splitting…' : 'Merging…'}
          >
            {tab === 'split' ? 'Confirm separation' : 'Confirm recombination'}
          </ActionButton>

          {selectedMatured ? (
            <p className="mt-3 text-center text-xs text-warning-300">
              This maturity has passed — split and merge are closed. Claim or redeem it under “Your
              positions”.
            </p>
          ) : (
            isWrongNetwork && (
              <p className="mt-3 text-center text-xs text-warning-300">
                Switch your wallet to Testnet to continue.
              </p>
            )
          )}

          {outcome && (
            <div className="mt-5">
              <TxStatus outcome={outcome} onRetry={submit} />
            </div>
          )}
        </>
      )}
    </section>
  )
}
