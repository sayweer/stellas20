/** Per-maturity position cards: countdown, live yield, claim and redeem. */
import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { MaturityPosition } from '../hooks/usePortfolio'
import { claimYield, redeemPt } from '../lib/contracts/splitter'
import { formatAmount } from '../lib/format'
import { maturityCountdown, claimableAt, type RateCheckpoint } from '../lib/yield'
import { formatMaturity } from '../lib/format'
import { chainNowMs } from '../lib/chainTime'
import { useTxRunner } from '../hooks/useTxRunner'
import { ClockIcon, CoinsIcon } from './icons'
import { TxStatus } from './TxStatus'
import { ActionButton } from './forms'

interface MaturityPanelProps {
  address: string
  positions: MaturityPosition[]
  /** Rate checkpoint; claimable is computed per-position, frozen at its maturity. */
  rateInfo: RateCheckpoint | null
  isWrongNetwork: boolean
  onSuccess: () => void
}

export function MaturityPanel({
  address,
  positions,
  rateInfo,
  isWrongNetwork,
  onSuccess,
}: MaturityPanelProps): ReactElement | null {
  const [nowMs, setNowMs] = useState(() => chainNowMs())
  useEffect(() => {
    const t = window.setInterval(() => {
      setNowMs(chainNowMs())
    }, 1000)
    return () => {
      window.clearInterval(t)
    }
  }, [])

  const active = positions.filter((p) => p.position.pt > 0n || p.position.yt > 0n)

  return (
    <section
      aria-labelledby="positions-heading"
      className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6"
    >
      <h2 id="positions-heading" className="text-sm font-medium text-neutral-400">
        Your positions
      </h2>
      {active.length === 0 && (
        <p className="mt-4 text-sm text-neutral-400">
          Split SY at a maturity to open a position — your PT, YT and claimable yield will appear
          here.
        </p>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {active.map((p) => (
          <MaturityCard
            key={p.maturity.toString()}
            address={address}
            item={p}
            rateInfo={rateInfo}
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
  rateInfo: RateCheckpoint | null
  nowMs: number
  isWrongNetwork: boolean
  onSuccess: () => void
}

function MaturityCard({
  address,
  item,
  rateInfo,
  nowMs,
  isWrongNetwork,
  onSuccess,
}: MaturityCardProps): ReactElement {
  const { maturity, position } = item
  const { outcome, pending, run } = useTxRunner()
  const countdown = maturityCountdown(maturity, nowMs)
  // Freeze the rate at this position's maturity so a matured position's claimable
  // plateaus instead of ticking up forever. `null` (rate unknown) shows "—".
  const claimable =
    rateInfo === null
      ? null
      : claimableAt(position, rateInfo, maturity, BigInt(Math.floor(nowMs / 1000)))
  // Matured, principal redeemed, and nothing left to claim — the position is done.
  const settled = countdown.matured && position.pt <= 0n && claimable !== null && claimable <= 0n
  const canClaim = claimable !== null && claimable > 0n

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
        <span className="min-w-0 truncate text-sm font-medium text-neutral-200">
          {formatMaturity(maturity)}
        </span>
        {countdown.matured ? (
          <span className="shrink-0 rounded-full bg-warning-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning-300">
            Matured
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-neutral-400">
            <ClockIcon className="h-3.5 w-3.5" />
            {countdown.days > 0 && `${countdown.days.toString()}d `}
            {String(countdown.hours).padStart(2, '0')}:{String(countdown.minutes).padStart(2, '0')}:
            {String(countdown.seconds).padStart(2, '0')}
          </span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-neutral-400">PT (principal)</dt>
          <dd className="font-mono tabular-nums text-neutral-100">{formatAmount(position.pt)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-neutral-400">YT (yield)</dt>
          <dd className="font-mono tabular-nums text-neutral-100">{formatAmount(position.yt)}</dd>
        </div>
      </dl>

      <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2">
        <CoinsIcon className="h-4 w-4 text-positive-400" />
        <span className="text-xs text-neutral-300">Claimable now</span>
        <span className="ml-auto font-mono text-sm font-semibold tabular-nums text-positive-300">
          {claimable === null ? '—' : `${formatAmount(claimable, 6)} SY`}
        </span>
      </div>

      {settled ? (
        <p className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-center text-xs font-medium text-neutral-400">
          Settled — principal redeemed and yield claimed.
        </p>
      ) : (
        <>
          <div className="mt-3 flex gap-2">
            <ActionButton
              onClick={claim}
              disabled={isWrongNetwork || pending || !canClaim}
              pending={pending && outcome?.status === 'pending' && outcome.label === 'Claim'}
              pendingLabel="Claiming…"
            >
              Claim yield
            </ActionButton>
            <ActionButton
              variant="secondary"
              onClick={redeem}
              disabled={isWrongNetwork || pending || !countdown.matured || position.pt <= 0n}
              pending={pending && outcome?.status === 'pending' && outcome.label === 'Redeem'}
              pendingLabel="Redeeming…"
            >
              Redeem PT
            </ActionButton>
          </div>

          {claimable !== null && claimable <= 0n && position.yt > 0n && (
            <p className="mt-2 text-center text-[11px] text-neutral-400">
              No yield to claim yet — it accrues over time.
            </p>
          )}
          {!countdown.matured && (
            <p className="mt-2 text-center text-[11px] text-neutral-400">
              PT redeems its fixed principal once matured.
            </p>
          )}
          {isWrongNetwork && (
            <p className="mt-2 text-center text-[11px] text-warning-300">
              Switch your wallet to Testnet to act.
            </p>
          )}
        </>
      )}

      {outcome && (
        <div className="mt-4">
          <TxStatus outcome={outcome} />
        </div>
      )}
    </div>
  )
}
