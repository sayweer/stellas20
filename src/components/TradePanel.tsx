/** Trade tab: lock a fixed rate (SY→PT) or go long yield (split, sell PT). */
import { useEffect, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { MaturityPool } from '../hooks/usePools'
import type { MaturityPosition } from '../hooks/usePortfolio'
import { useNow } from '../hooks/useNow'
import { useTxRunner } from '../hooks/useTxRunner'
import { stroopsToXlm } from '../lib/amounts'
import { activeMarket } from '../lib/market'
import { formatAmount, formatMaturity } from '../lib/format'
import { isValidTokenAmount } from '../lib/validation'
import { maturityCountdown, RATE_SCALE } from '../lib/yield'
import {
  clearLongYieldProgress,
  readLongYieldProgress,
  resolveLongYieldRecovery,
  saveLongYieldProgress,
} from '../lib/longYieldProgress'
import {
  effectiveApy,
  formatPercent,
  minOutFromSlippage,
  priceImpact,
  quoteSwap,
  type Reserves,
} from '../lib/amm'
import { splitSy } from '../lib/contracts/splitter'
import { swapExactIn } from '../lib/contracts/amm'
import { AmountField, ActionButton } from './forms'
import { MaturitySelect } from './MaturitySelect'
import { SlippageControl } from './SlippageControl'
import { TxStatus } from './TxStatus'
import { AlertTriangleIcon, LockIcon } from './icons'

interface TradePanelProps {
  mode: 'lock' | 'long'
  address: string
  isWrongNetwork: boolean
  pools: MaturityPool[]
  positions: MaturityPosition[]
  loading: boolean
  syBalance: bigint
  liveRate: bigint | null
  /** A maturity to preselect (e.g. clicked from Markets). */
  initialMaturity: bigint | null
  onMaturityChange: (maturity: bigint) => void
  onSuccess: () => void
  /** Jump to the Advanced tab — the only place SY can be minted. */
  onGoAdvanced: () => void
}

export function TradePanel({
  mode,
  address,
  isWrongNetwork,
  pools,
  positions,
  loading,
  syBalance,
  liveRate,
  initialMaturity,
  onMaturityChange,
  onSuccess,
  onGoAdvanced,
}: TradePanelProps): ReactElement {
  const now = useNow()

  // Only maturities with a funded, unexpired pool are tradeable.
  const tradeable = pools.filter(
    (p) =>
      p.pool !== null &&
      p.pool.ptReserve > 0n &&
      p.pool.syReserve > 0n &&
      Number(p.maturity) * 1000 > now,
  )
  // Only honour the incoming preselection while it is still tradeable: it is
  // captured on a click in Markets and outlives it, so a maturity that has since
  // expired or lost its liquidity would select a pool that isn't there — leaving
  // the panel with a dropdown showing a value it doesn't list and no form at all.
  const preselect =
    (initialMaturity !== null && tradeable.some((p) => p.maturity === initialMaturity)
      ? initialMaturity
      : tradeable[0]?.maturity) ?? null
  const selected = preselect
  const selectedPool = tradeable.find((p) => p.maturity === selected)?.pool ?? null
  const selectedPtBalance =
    positions.find((position) => position.maturity === selected)?.position.pt ?? 0n

  return (
    <div>
      <header>
        <h2 className="text-lg font-medium tracking-[-0.02em] text-neutral-100">
          {mode === 'lock' ? 'Lock a fixed return' : 'Increase yield exposure'}
        </h2>
        <p className="mt-1 text-sm text-neutral-400">
          {mode === 'lock'
            ? 'Buy PT at today’s price and redeem its maturity value later.'
            : 'Split SY, sell the principal side, and keep the variable yield side.'}
        </p>
      </header>

      {loading ? (
        <div
          role="status"
          aria-live="polite"
          aria-label="Loading active maturities"
          className="mt-5 space-y-3"
        >
          <div className="h-11 animate-pulse rounded-xl bg-neutral-850" />
          <div className="h-28 animate-pulse rounded-xl bg-neutral-850" />
        </div>
      ) : tradeable.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-400">
          No active maturity is available right now. Try again after a pool has been funded.
        </p>
      ) : (
        <>
          <div className="mt-4">
            <MaturitySelect
              options={tradeable.map((p) => ({ maturity: p.maturity, matured: false }))}
              value={selected}
              onChange={onMaturityChange}
            />
          </div>

          {selected !== null && selectedPool !== null && (
            <div className="mt-5">
              {mode === 'lock' ? (
                <LockRateForm
                  key={`lock-${selected.toString()}`}
                  address={address}
                  isWrongNetwork={isWrongNetwork}
                  maturity={selected}
                  pool={selectedPool}
                  syBalance={syBalance}
                  liveRate={liveRate}
                  nowMs={now}
                  onSuccess={onSuccess}
                  onGoAdvanced={onGoAdvanced}
                />
              ) : (
                <LongYieldForm
                  key={`long-${selected.toString()}`}
                  address={address}
                  isWrongNetwork={isWrongNetwork}
                  maturity={selected}
                  pool={selectedPool}
                  syBalance={syBalance}
                  existingPtBalance={selectedPtBalance}
                  liveRate={liveRate}
                  onSuccess={onSuccess}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** A labelled figure line in the quote breakdown. */
function SummaryRow({
  label,
  children,
  accent,
}: {
  label: string
  children: ReactNode
  accent?: boolean
}): ReactElement {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] items-start gap-3 text-sm">
      <span className="text-neutral-400">{label}</span>
      <span
        className={`min-w-0 break-all text-right font-mono tabular-nums ${accent ? 'font-medium text-positive-300' : 'text-neutral-200'}`}
      >
        {children}
      </span>
    </div>
  )
}

interface LockFormProps {
  address: string
  isWrongNetwork: boolean
  maturity: bigint
  pool: Reserves
  syBalance: bigint
  liveRate: bigint | null
  nowMs: number
  onSuccess: () => void
  onGoAdvanced: () => void
}

/** Lock a fixed rate: swap SY → PT at a discount, redeem 1:1 at maturity. */
function LockRateForm({
  address,
  isWrongNetwork,
  maturity,
  pool,
  syBalance,
  liveRate,
  nowMs,
  onSuccess,
  onGoAdvanced,
}: LockFormProps): ReactElement {
  const [amount, setAmount] = useState('')
  const [slippageBps, setSlippageBps] = useState(50)
  const [acceptsLoss, setAcceptsLoss] = useState(false)
  const { outcome, pending, blocked, run, reset } = useTxRunner()

  // A new amount is a new trade — never carry an acknowledgement across it.
  function changeAmount(next: string): void {
    setAmount(next)
    setAcceptsLoss(false)
    reset()
  }

  const valid = isValidTokenAmount(amount, syBalance, { label: 'SY' })
  const syIn = valid.ok ? valid.stroops : 0n
  const ptOut = syIn > 0n ? quoteSwap(pool, 'SyToPt', syIn) : 0n
  const minOut = minOutFromSlippage(ptOut, slippageBps)
  const dtSeconds = Number(maturity) - Math.floor(nowMs / 1000)
  const lockedApy =
    liveRate !== null && ptOut > 0n ? effectiveApy(syIn, ptOut, liveRate, dtSeconds) : null
  const impact = syIn > 0n ? priceImpact(pool.syReserve, pool.ptReserve, syIn) : 0
  const countdown = maturityCountdown(maturity, nowMs)
  // Paying above par for PT locks in a loss: PT only ever redeems its
  // principal, so a negative rate here is the trade's actual outcome, not a
  // display artefact. Shallow pools and near maturities make it easy to reach
  // with a modest order, so it has to be acknowledged rather than just shown.
  const locksLoss = lockedApy !== null && lockedApy < 0

  function submit(): void {
    if (!valid.ok || pending || blocked || ptOut <= 0n || (locksLoss && !acceptsLoss)) return
    void run(
      'Lock rate',
      (onPhase) => swapExactIn(address, maturity, 'SyToPt', syIn, minOut, onPhase),
      () => {
        setAmount('')
        onSuccess()
      },
      `${formatAmount(syIn)} SY → at least ${formatAmount(minOut)} PT · ${formatMaturity(maturity)}`,
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-hairline bg-neutral-900 px-4 py-3">
        <div className="flex items-center gap-2">
          <LockIcon className="h-4 w-4 text-positive-400" />
          <span className="text-sm font-medium text-neutral-100">
            {lockedApy === null ? 'Lock a fixed rate' : `Lock ${formatPercent(lockedApy)} APY`}
          </span>
        </div>
        <p className="mt-1 text-xs text-neutral-400">
          until {formatMaturity(maturity)} · {countdown.days}d {countdown.hours}h left
        </p>
      </div>

      <AmountField
        id="lock-amount"
        value={amount}
        onChange={changeAmount}
        unit="SY"
        hint={`Available: ${formatAmount(syBalance)} SY`}
        error={amount.trim() !== '' && !valid.ok ? valid.reason : null}
        onEnter={submit}
        disabled={blocked}
        onMax={
          syBalance > 0n && !blocked
            ? () => {
                setAmount(stroopsToXlm(syBalance))
              }
            : undefined
        }
      />

      {syBalance === 0n && (
        <p className="text-xs text-neutral-400">
          You have no SY yet — wrap {activeMarket().underlyingSymbol} into SY first.{' '}
          <button
            type="button"
            onClick={onGoAdvanced}
            className="ml-1 inline-flex min-h-11 items-center rounded-full border border-boundary px-3 font-medium text-neutral-100 transition-colors hover:bg-raised hover:text-accent-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-300"
          >
            Open Convert
          </button>
        </p>
      )}

      {ptOut > 0n && (
        <div className="rounded-xl border border-hairline bg-neutral-950/40 p-4">
          <p className="text-sm font-semibold text-neutral-100">Review fixed return</p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-400">
            Check the outcome below before your wallet opens.
          </p>
          <div className="mt-4 space-y-2.5">
            <SummaryRow label="You pay">{formatAmount(syIn)} SY</SummaryRow>
            <SummaryRow label="You receive at least" accent>
              {formatAmount(minOut)} PT
            </SummaryRow>
            <SummaryRow label="Fixed APY">{formatPercent(lockedApy)}</SummaryRow>
            <SummaryRow label="Maturity">{formatMaturity(maturity)}</SummaryRow>
          </div>
          <p className="mt-4 border-t border-hairline pt-3 text-xs leading-relaxed text-neutral-400">
            Hold PT until maturity for its displayed redemption outcome. Selling earlier may return
            less.
          </p>
          <details className="mt-3 border-t border-hairline pt-3 text-xs">
            <summary className="flex min-h-11 cursor-pointer items-center rounded py-2 font-medium text-neutral-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-300">
              Price and slippage details
            </summary>
            <div className="mt-2 space-y-2.5 pb-1">
              <SummaryRow label="Quoted PT">{formatAmount(ptOut)} PT</SummaryRow>
              <SummaryRow label="Price impact">{formatPercent(impact)}</SummaryRow>
              <SummaryRow label="Maximum slippage">{(slippageBps / 100).toFixed(2)}%</SummaryRow>
              <SlippageControl bps={slippageBps} onChange={setSlippageBps} />
              <p className="text-neutral-500">
                Your wallet shows the final Stellar network fee before approval.
              </p>
            </div>
          </details>
        </div>
      )}

      {locksLoss && (
        <div
          role="alert"
          className="rounded-xl border border-warning-500/30 bg-warning-500/10 p-3.5 text-warning-100"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-warning-400" />
            <div className="space-y-1">
              <p className="text-sm font-medium">This trade locks in a loss</p>
              <p className="text-xs leading-relaxed text-warning-100/80">
                You would pay more for {formatAmount(ptOut)} PT than it redeems for at maturity — a
                fixed rate of {formatPercent(lockedApy)}. The 0.30% swap fee and this order&apos;s
                price impact together outweigh the yield left until {formatMaturity(maturity)}. A
                later maturity, or a deeper pool, prices better.
              </p>
            </div>
          </div>
          <label className="mt-3 flex min-h-11 items-center gap-2.5 text-xs font-medium">
            <input
              type="checkbox"
              checked={acceptsLoss}
              onChange={(e) => {
                setAcceptsLoss(e.target.checked)
              }}
              className="h-6 w-6 shrink-0 rounded border-warning-300 bg-transparent accent-warning-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-300"
            />
            I understand this locks a negative rate
          </label>
        </div>
      )}

      <ActionButton
        onClick={submit}
        disabled={
          isWrongNetwork || blocked || !valid.ok || ptOut <= 0n || (locksLoss && !acceptsLoss)
        }
        pending={pending}
        pendingLabel="Locking rate…"
      >
        Confirm fixed return in wallet
      </ActionButton>

      <p className="text-center text-[11px] text-neutral-500">
        PT redeems its full principal at maturity — the discount you buy at is your fixed return.
      </p>

      {isWrongNetwork && (
        <p className="text-center text-xs text-warning-300">
          Switch your wallet to Testnet to continue.
        </p>
      )}
      {outcome && (
        <div>
          <button type="button" onClick={reset} className="sr-only">
            Dismiss status
          </button>
          <TxStatus outcome={outcome} onRetry={submit} />
        </div>
      )}
    </div>
  )
}

interface LongFormProps {
  address: string
  isWrongNetwork: boolean
  maturity: bigint
  pool: Reserves
  syBalance: bigint
  existingPtBalance: bigint
  liveRate: bigint | null
  onSuccess: () => void
}

/**
 * Long yield in two clearly-staged transactions: split SY into PT+YT, then sell
 * the PT back to the pool — you keep the YT for pure, leveraged yield exposure.
 */
function LongYieldForm({
  address,
  isWrongNetwork,
  maturity,
  pool,
  syBalance,
  existingPtBalance,
  liveRate,
  onSuccess,
}: LongFormProps): ReactElement {
  const marketKey = activeMarket().key
  const [savedProgress, setSavedProgress] = useState(() =>
    readLongYieldProgress(address, marketKey, maturity),
  )
  const recovery = resolveLongYieldRecovery(savedProgress, existingPtBalance)
  const canResumeSaved = recovery.kind === 'resume_saved'
  const [amount, setAmount] = useState(() =>
    recovery.kind === 'resume_saved' && recovery.syIn > 0n ? stroopsToXlm(recovery.syIn) : '',
  )
  const [slippageBps, setSlippageBps] = useState(50)
  /** PT minted by step 1, awaiting sale in step 2 (null until split confirms). */
  const [ptToSell, setPtToSell] = useState<bigint | null>(null)
  const [allowNewSplit, setAllowNewSplit] = useState(existingPtBalance === 0n && !canResumeSaved)
  const [progressStorageWarning, setProgressStorageWarning] = useState(false)
  const split = useTxRunner()
  const sell = useTxRunner()

  const valid = isValidTokenAmount(amount, syBalance, { label: 'SY' })
  const syIn = valid.ok ? valid.stroops : 0n
  // Split output preview (floor(sy·rate/SCALE)); PT == YT.
  const projected = liveRate !== null && syIn > 0n ? (syIn * liveRate) / RATE_SCALE : 0n
  const sellBack = projected > 0n ? quoteSwap(pool, 'PtToSy', projected) : 0n
  const netCost = syIn > sellBack ? syIn - sellBack : 0n
  const step2 = ptToSell !== null
  const step2Quote = step2 && ptToSell > 0n ? quoteSwap(pool, 'PtToSy', ptToSell) : 0n
  const step2MinOut = minOutFromSlippage(step2Quote, slippageBps)
  const needsRecoveryChoice = !step2 && existingPtBalance > 0n && !allowNewSplit

  // A completed late sale can leave a continuation behind. Once verified
  // holdings show no PT, discard it so it can never target future PT.
  useEffect(() => {
    if (!savedProgress || existingPtBalance > 0n) return
    clearLongYieldProgress(address, marketKey, maturity)
    // Intentional external-storage reconciliation: prevent this mounted form
    // from reusing the record if balances later refresh in the background.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSavedProgress(null)
  }, [address, existingPtBalance, marketKey, maturity, savedProgress])

  function doSplit(): void {
    if (!allowNewSplit || !valid.ok || split.pending || split.blocked || projected <= 0n) return
    let captured: bigint | null = null
    void split.run(
      'Split',
      (onPhase) =>
        splitSy(address, maturity, syIn, onPhase).then((r) => {
          if ('ptOut' in r) captured = r.ptOut
          return r
        }),
      () => {
        if (captured === null || captured <= 0n) return
        const saved = saveLongYieldProgress({
          address,
          marketKey,
          maturity,
          ptOut: captured,
          syIn,
          source: 'split',
        })
        setProgressStorageWarning(!saved)
        setPtToSell(captured)
        onSuccess()
      },
      `${formatAmount(syIn)} SY · ${formatMaturity(maturity)} · step 1 of 2`,
    )
  }

  function doSell(): void {
    if (ptToSell === null || ptToSell <= 0n || step2Quote <= 0n || sell.pending || sell.blocked)
      return
    const minOut = minOutFromSlippage(quoteSwap(pool, 'PtToSy', ptToSell), slippageBps)
    void sell.run(
      'Sell PT',
      (onPhase) => swapExactIn(address, maturity, 'PtToSy', ptToSell, minOut, onPhase),
      () => {
        clearLongYieldProgress(address, marketKey, maturity)
        setAmount('')
        setPtToSell(null)
        setAllowNewSplit(existingPtBalance === ptToSell)
        onSuccess()
      },
      `${formatAmount(ptToSell)} PT · ${formatMaturity(maturity)} · step 2 of 2`,
    )
  }

  function continueWithExistingPt(): void {
    if (existingPtBalance <= 0n) return
    const saved = saveLongYieldProgress({
      address,
      marketKey,
      maturity,
      ptOut: existingPtBalance,
      syIn: 0n,
      source: 'existing',
    })
    setProgressStorageWarning(!saved)
    setPtToSell(existingPtBalance)
  }

  function continueWithSavedPt(): void {
    if (recovery.kind !== 'resume_saved') return
    setPtToSell(recovery.ptOut)
  }

  function startNewSplit(): void {
    clearLongYieldProgress(address, marketKey, maturity)
    setPtToSell(null)
    setAmount('')
    setAllowNewSplit(true)
    setProgressStorageWarning(false)
    split.reset()
    sell.reset()
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-400">
        Split SY into PT + YT, then sell the PT — you keep the{' '}
        <span className="text-neutral-200">YT</span> for pure yield exposure. Two transactions.
      </p>

      {needsRecoveryChoice ? (
        <div role="status" className="rounded-xl border border-warning-300 bg-warning-500/10 p-4">
          <p className="text-sm font-semibold text-warning-100">Existing PT needs a choice</p>
          <p className="mt-1 text-xs leading-relaxed text-warning-200/80">
            This wallet already holds {formatAmount(existingPtBalance)} PT for{' '}
            {formatMaturity(maturity)}. It may be a fixed-return holding or the first half of an
            interrupted yield strategy. Everspan will not split or sell until you choose.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {canResumeSaved && recovery.kind === 'resume_saved' ? (
              <ActionButton variant="secondary" onClick={continueWithSavedPt}>
                Resume saved step — sell {formatAmount(recovery.ptOut)} PT
              </ActionButton>
            ) : (
              <ActionButton variant="secondary" onClick={continueWithExistingPt}>
                Use all {formatAmount(existingPtBalance)} PT for step 2
              </ActionButton>
            )}
            <ActionButton variant="secondary" onClick={startNewSplit}>
              Keep PT and split more SY
            </ActionButton>
          </div>
        </div>
      ) : null}

      {step2 ? (
        <div role="status" className="rounded-xl border border-positive-300 bg-positive-500/10 p-4">
          <p className="text-sm font-semibold text-positive-100">Step 1 is already complete</p>
          <p className="mt-1 text-xs leading-relaxed text-positive-200/80">
            Continue by selling exactly {formatAmount(ptToSell)} PT. Everspan will not create
            another split for this flow.
          </p>
        </div>
      ) : null}

      <AmountField
        id="long-amount"
        value={amount}
        onChange={(v) => {
          setAmount(v)
          setPtToSell(null)
          sell.reset()
        }}
        unit="SY"
        hint={`Available: ${formatAmount(syBalance)} SY`}
        error={amount.trim() !== '' && !valid.ok ? valid.reason : null}
        disabled={step2 || needsRecoveryChoice || split.blocked || sell.blocked}
        onMax={
          syBalance > 0n && !step2 && !needsRecoveryChoice
            ? () => {
                setAmount(stroopsToXlm(syBalance))
              }
            : undefined
        }
      />

      {!step2 && projected > 0n && (
        <div className="rounded-xl border border-hairline bg-neutral-950/40 p-4">
          <p className="text-sm font-semibold text-neutral-100">Review yield exposure</p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-400">
            This strategy needs two wallet approvals. The progress stays visible below.
          </p>
          <div className="mt-4 space-y-2.5">
            <SummaryRow label="You use">{formatAmount(syIn)} SY</SummaryRow>
            <SummaryRow label="YT you keep" accent>
              {formatAmount(projected)} YT
            </SummaryRow>
            <SummaryRow label="PT sold for">≈ {formatAmount(sellBack)} SY</SummaryRow>
            <SummaryRow label="Estimated net cost">≈ {formatAmount(netCost)} SY</SummaryRow>
          </div>
          <p className="mt-4 border-t border-hairline pt-3 text-xs leading-relaxed text-neutral-400">
            YT captures realized yield until maturity. Its remaining opportunity falls as maturity
            approaches, and returns depend on the yield actually earned.
          </p>
          <details className="mt-3 border-t border-hairline pt-3 text-xs">
            <summary className="flex min-h-11 cursor-pointer items-center rounded py-2 font-medium text-neutral-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-300">
              Slippage and fee details
            </summary>
            <div className="mt-2 space-y-2.5 pb-1">
              <SummaryRow label="Maximum slippage">{(slippageBps / 100).toFixed(2)}%</SummaryRow>
              <SlippageControl bps={slippageBps} onChange={setSlippageBps} />
              <p className="text-neutral-500">
                Your wallet shows the final Stellar network fee before each approval.
              </p>
            </div>
          </details>
        </div>
      )}

      {step2 && step2Quote > 0n ? (
        <div className="rounded-xl border border-hairline bg-neutral-950/40 p-4">
          <p className="text-sm font-semibold text-neutral-100">Review remaining transaction</p>
          <div className="mt-4 space-y-2.5">
            <SummaryRow label="PT sold">{formatAmount(ptToSell)} PT</SummaryRow>
            <SummaryRow label="You receive at least" accent>
              {formatAmount(step2MinOut)} SY
            </SummaryRow>
            <SummaryRow label="Maximum slippage">{(slippageBps / 100).toFixed(2)}%</SummaryRow>
          </div>
          <div className="mt-3 border-t border-hairline pt-3">
            <SlippageControl bps={slippageBps} onChange={setSlippageBps} />
          </div>
        </div>
      ) : null}

      {step2 && step2Quote <= 0n ? (
        <p role="alert" className="text-xs leading-relaxed text-warning-300">
          The pool cannot quote this PT amount right now. Keep the saved step and try again after
          liquidity is available.
        </p>
      ) : null}

      {progressStorageWarning ? (
        <p role="alert" className="text-xs leading-relaxed text-warning-300">
          Keep this page open until step 2 finishes. Everspan could not save this continuation for a
          reload; existing PT detection will still prevent an automatic duplicate split.
        </p>
      ) : null}

      {/* Stage indicators */}
      <ol className="flex items-center gap-2 text-xs">
        <StageChip n={1} label="Split" done={step2} active={!step2} />
        <span className="h-px flex-1 bg-raised" />
        <StageChip n={2} label="Sell PT" done={false} active={step2} />
      </ol>

      {!step2 ? (
        <ActionButton
          onClick={doSplit}
          disabled={
            isWrongNetwork ||
            !allowNewSplit ||
            needsRecoveryChoice ||
            split.blocked ||
            !valid.ok ||
            projected <= 0n
          }
          pending={split.pending}
          pendingLabel="Splitting…"
        >
          Approve 1 of 2 — Separate yield
        </ActionButton>
      ) : (
        <ActionButton
          onClick={doSell}
          disabled={
            isWrongNetwork ||
            sell.blocked ||
            ptToSell === null ||
            ptToSell <= 0n ||
            step2Quote <= 0n
          }
          pending={sell.pending}
          pendingLabel="Selling PT…"
        >
          Approve 2 of 2 — Sell {formatAmount(ptToSell ?? 0n)} PT
        </ActionButton>
      )}

      {isWrongNetwork && (
        <p className="text-center text-xs text-warning-300">
          Switch your wallet to Testnet to continue.
        </p>
      )}
      {split.outcome && <TxStatus outcome={split.outcome} onRetry={doSplit} />}
      {sell.outcome && <TxStatus outcome={sell.outcome} onRetry={doSell} />}
    </div>
  )
}

function StageChip({
  n,
  label,
  done,
  active,
}: {
  n: number
  label: string
  done: boolean
  active: boolean
}): ReactElement {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${
        done
          ? 'bg-accent-500/15 text-accent-300'
          : active
            ? 'bg-raised text-neutral-100'
            : 'text-neutral-500'
      }`}
    >
      <span
        className={`grid h-4 w-4 place-items-center rounded-full text-[10px] ${
          done
            ? 'bg-accent-500 text-onAccent'
            : active
              ? 'bg-raised text-neutral-100'
              : 'bg-raised text-neutral-500'
        }`}
      >
        {done ? '✓' : n}
      </span>
      {label}
    </span>
  )
}
