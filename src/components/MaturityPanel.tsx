/** Per-maturity position cards: countdown, live yield, claim and redeem. */
import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { MaturityPosition } from '../hooks/usePortfolio'
import { claimYield, redeemPt } from '../lib/contracts/splitter'
import { formatAmount } from '../lib/format'
import { maturityCountdown, projectedClaimable } from '../lib/yield'
import { formatMaturity } from '../lib/format'
import { useTxRunner } from '../hooks/useTxRunner'
import { ClockIcon, CoinsIcon } from './icons'
import { TxStatus } from './TxStatus'
import { ActionButton } from './forms'

interface MaturityPanelProps {
  address: string
  positions: MaturityPosition[]
  liveRate: bigint | null
  isWrongNetwork: boolean
  onSuccess: () => void
}

export function MaturityPanel({
  address,
  positions,
  liveRate,
  isWrongNetwork,
  onSuccess,
}: MaturityPanelProps): ReactElement | null {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)
    return () => {
      window.clearInterval(t)
    }
  }, [])

  const active = positions.filter((p) => p.position.pt > 0n || p.position.yt > 0n)
  if (active.length === 0) return null

  return (
    <section
      aria-labelledby="positions-heading"
      className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 sm:p-6"
    >
      <h2 id="positions-heading" className="text-sm font-medium text-neutral-400">
        Your positions
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {active.map((p) => (
          <MaturityCard
            key={p.maturity.toString()}
            address={address}
            item={p}
            liveRate={liveRate}
            nowMs={nowMs}
            isWrongNetwork={isWrongNetwork}
            onSuccess={onSuccess}
          />
        ))}
      </div>
    </section>
  )
}

interface MaturityCardProps {
  address: string
  item: MaturityPosition
  liveRate: bigint | null
  nowMs: number
  isWrongNetwork: boolean
  onSuccess: () => void
}

function MaturityCard({
  address,
  item,
  liveRate,
  nowMs,
  isWrongNetwork,
  onSuccess,
}: MaturityCardProps): ReactElement {
  const { maturity, position } = item
  const { outcome, pending, run } = useTxRunner()
  const countdown = maturityCountdown(maturity, nowMs)
  const claimable = liveRate === null ? 0n : projectedClaimable(position, liveRate)

  function claim(): void {
    if (pending) return
    void run('Claim', (onPhase) => claimYield(address, maturity, onPhase), onSuccess)
  }
  function redeem(): void {
    if (pending) return
    void run('Redeem', (onPhase) => redeemPt(address, maturity, position.pt, onPhase), onSuccess)
  }

  return (
    <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-neutral-200">{formatMaturity(maturity)}</span>
        {countdown.matured ? (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
            Matured
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-neutral-400">
            <ClockIcon className="h-3.5 w-3.5" />
            {countdown.days > 0 && `${countdown.days.toString()}d `}
            {String(countdown.hours).padStart(2, '0')}:{String(countdown.minutes).padStart(2, '0')}:
            {String(countdown.seconds).padStart(2, '0')}
          </span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-neutral-500">PT (principal)</dt>
          <dd className="font-mono tabular-nums text-neutral-100">{formatAmount(position.pt)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-neutral-500">YT (yield)</dt>
          <dd className="font-mono tabular-nums text-neutral-100">{formatAmount(position.yt)}</dd>
        </div>
      </dl>

      <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
        <CoinsIcon className="h-4 w-4 text-emerald-400" />
        <span className="text-xs text-neutral-400">Claimable now</span>
        <span className="ml-auto font-mono text-sm font-semibold tabular-nums text-emerald-300">
          {formatAmount(claimable, 6)} SY
        </span>
      </div>

      <div className="mt-3 flex gap-2">
        <ActionButton
          onClick={claim}
          disabled={isWrongNetwork || claimable <= 0n}
          pending={pending && outcome?.status === 'pending' && outcome.label === 'Claim'}
          pendingLabel="Claiming…"
        >
          Claim yield
        </ActionButton>
        <ActionButton
          variant="secondary"
          onClick={redeem}
          disabled={isWrongNetwork || !countdown.matured || position.pt <= 0n}
          pending={pending && outcome?.status === 'pending' && outcome.label === 'Redeem'}
          pendingLabel="Redeeming…"
        >
          Redeem PT
        </ActionButton>
      </div>

      {!countdown.matured && (
        <p className="mt-2 text-center text-[11px] text-neutral-500">
          PT redeems its fixed principal once matured.
        </p>
      )}

      {outcome && (
        <div className="mt-4">
          <TxStatus outcome={outcome} />
        </div>
      )}
    </div>
  )
}
