/** Trade tab: lock a fixed rate (SY→PT) or go long yield (split, sell PT). */
import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { MaturityPool } from '../hooks/usePools'
import { useNow } from '../hooks/useNow'
import { useTxRunner } from '../hooks/useTxRunner'
import { stroopsToXlm } from '../lib/amounts'
import { activeMarket } from '../lib/market'
import { formatAmount, formatMaturity } from '../lib/format'
import { isValidTokenAmount } from '../lib/validation'
import { maturityCountdown, RATE_SCALE } from '../lib/yield'
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
import { AmountField, ActionButton, TabToggle } from './forms'
import { MaturitySelect } from './MaturitySelect'
import { SlippageControl } from './SlippageControl'
import { TxStatus } from './TxStatus'
import { LockIcon, SwapIcon } from './icons'

interface TradePanelProps {
  address: string
  isWrongNetwork: boolean
  pools: MaturityPool[]
  syBalance: bigint
  liveRate: bigint | null
  /** A maturity to preselect (e.g. clicked from Markets). */
  initialMaturity: bigint | null
  onSuccess: () => void
}

type Mode = 'lock' | 'long'

export function TradePanel({
  address,
  isWrongNetwork,
  pools,
  syBalance,
  liveRate,
  initialMaturity,
  onSuccess,
}: TradePanelProps): ReactElement {
  const now = useNow()
  const [mode, setMode] = useState<Mode>('lock')
  const [maturity, setMaturity] = useState<bigint | null>(null)

  // Only maturities with a funded, unexpired pool are tradeable.
  const tradeable = pools.filter(
    (p) =>
      p.pool !== null &&
      p.pool.ptReserve > 0n &&
      p.pool.syReserve > 0n &&
      Number(p.maturity) * 1000 > now,
  )
  const preselect = initialMaturity ?? tradeable[0]?.maturity ?? null
  const selected =
    maturity !== null && tradeable.some((p) => p.maturity === maturity) ? maturity : preselect
  const selectedPool = tradeable.find((p) => p.maturity === selected)?.pool ?? null

  return (
    <section
      id="panel-trade"
      role="tabpanel"
      aria-labelledby="tab-trade"
    >
      <div className="flex items-center gap-2">
        <SwapIcon className="h-4 w-4 text-neutral-400" />
        <h2 className="text-sm font-medium text-neutral-400">Trade</h2>
      </div>

      {tradeable.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-400">
          No active pools to trade yet. A maturity needs a seeded pool before you can lock a rate.
        </p>
      ) : (
        <>
          <div className="mt-4">
            <MaturitySelect
              options={tradeable.map((p) => ({ maturity: p.maturity, matured: false }))}
              value={selected}
              onChange={setMaturity}
            />
          </div>

          <TabToggle
            className="mt-4"
            label="Trade direction"
            options={[
              { id: 'lock', label: 'Lock fixed rate' },
              { id: 'long', label: 'Long yield' },
            ]}
            active={mode}
            onChange={(id) => {
              setMode(id as Mode)
            }}
          />

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
                />
              ) : (
                <LongYieldForm
                  key={`long-${selected.toString()}`}
                  address={address}
                  isWrongNetwork={isWrongNetwork}
                  maturity={selected}
                  pool={selectedPool}
                  syBalance={syBalance}
                  liveRate={liveRate}
                  onSuccess={onSuccess}
                />
              )}
            </div>
          )}
        </>
      )}
    </section>
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
    <div className="flex items-center justify-between text-sm">
      <span className="text-neutral-400">{label}</span>
      <span
        className={`font-mono tabular-nums ${accent ? 'font-semibold text-accent-300' : 'text-neutral-200'}`}
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
}: LockFormProps): ReactElement {
  const [amount, setAmount] = useState('')
  const [slippageBps, setSlippageBps] = useState(50)
  const { outcome, pending, run, reset } = useTxRunner()

  const valid = isValidTokenAmount(amount, syBalance, { label: 'SY' })
  const syIn = valid.ok ? valid.stroops : 0n
  const ptOut = syIn > 0n ? quoteSwap(pool, 'SyToPt', syIn) : 0n
  const minOut = minOutFromSlippage(ptOut, slippageBps)
  const dtSeconds = Number(maturity) - Math.floor(nowMs / 1000)
  const lockedApy =
    liveRate !== null && ptOut > 0n ? effectiveApy(syIn, ptOut, liveRate, dtSeconds) : null
  const impact = syIn > 0n ? priceImpact(pool.syReserve, pool.ptReserve, syIn) : 0
  const countdown = maturityCountdown(maturity, nowMs)

  function submit(): void {
    if (!valid.ok || pending || ptOut <= 0n) return
    void run(
      'Lock rate',
      (onPhase) => swapExactIn(address, maturity, 'SyToPt', syIn, minOut, onPhase),
      () => {
        setAmount('')
        onSuccess()
      },
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-accent-500/20 bg-accent-500/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <LockIcon className="h-4 w-4 text-accent-400" />
          <span className="text-sm font-medium text-accent-200">
            {lockedApy === null ? 'Lock a fixed rate' : `Lock ${formatPercent(lockedApy)} APY`}
          </span>
        </div>
        <p className="mt-1 text-xs text-accent-200/70">
          until {formatMaturity(maturity)} · {countdown.days}d {countdown.hours}h left
        </p>
      </div>

      <AmountField
        id="lock-amount"
        value={amount}
        onChange={setAmount}
        unit="SY"
        hint={`Available: ${formatAmount(syBalance)} SY`}
        error={amount.trim() !== '' && !valid.ok ? valid.reason : null}
        onEnter={submit}
        onMax={syBalance > 0n ? () => { setAmount(stroopsToXlm(syBalance)) } : undefined}
      />

      {syBalance === 0n && (
        <p className="text-xs text-neutral-400">
          You have no SY yet — wrap {activeMarket().underlyingSymbol} into SY in the{' '}
          <span className="text-neutral-200">Advanced</span> tab first.
        </p>
      )}

      {ptOut > 0n && (
        <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3.5">
          <SummaryRow label="You receive" accent>
            {formatAmount(ptOut)} PT
          </SummaryRow>
          <SummaryRow label="Locked APY">{formatPercent(lockedApy)}</SummaryRow>
          <SummaryRow label="Price impact">{formatPercent(impact)}</SummaryRow>
          <SummaryRow label="Min received">{formatAmount(minOut)} PT</SummaryRow>
          <div className="border-t border-neutral-800 pt-2">
            <SlippageControl bps={slippageBps} onChange={setSlippageBps} />
          </div>
        </div>
      )}

      <ActionButton
        onClick={submit}
        disabled={isWrongNetwork || !valid.ok || ptOut <= 0n}
        pending={pending}
        pendingLabel="Locking rate…"
      >
        Lock fixed rate
      </ActionButton>

      <p className="text-center text-[11px] text-neutral-500">
        PT redeems its full principal at maturity — the discount you buy at is your fixed return.
      </p>

      {isWrongNetwork && (
        <p className="text-center text-xs text-warning-300">Switch your wallet to Testnet to continue.</p>
      )}
      {outcome && (
        <div>
          <button type="button" onClick={reset} className="sr-only">
            Dismiss status
          </button>
          <TxStatus outcome={outcome} />
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
  liveRate,
  onSuccess,
}: LongFormProps): ReactElement {
  const [amount, setAmount] = useState('')
  const [slippageBps, setSlippageBps] = useState(50)
  /** PT minted by step 1, awaiting sale in step 2 (null until split confirms). */
  const [ptToSell, setPtToSell] = useState<bigint | null>(null)
  const split = useTxRunner()
  const sell = useTxRunner()

  const valid = isValidTokenAmount(amount, syBalance, { label: 'SY' })
  const syIn = valid.ok ? valid.stroops : 0n
  // Split output preview (floor(sy·rate/SCALE)); PT == YT.
  const projected = liveRate !== null && syIn > 0n ? (syIn * liveRate) / RATE_SCALE : 0n
  const sellBack = projected > 0n ? quoteSwap(pool, 'PtToSy', projected) : 0n
  const netCost = syIn > sellBack ? syIn - sellBack : 0n

  function doSplit(): void {
    if (!valid.ok || split.pending || projected <= 0n) return
    let captured: bigint | null = null
    void split.run(
      'Split',
      (onPhase) =>
        splitSy(address, maturity, syIn, onPhase).then((r) => {
          if ('ptOut' in r) captured = r.ptOut
          return r
        }),
      () => {
        setPtToSell(captured)
      },
    )
  }

  function doSell(): void {
    if (ptToSell === null || ptToSell <= 0n || sell.pending) return
    const minOut = minOutFromSlippage(quoteSwap(pool, 'PtToSy', ptToSell), slippageBps)
    void sell.run(
      'Sell PT',
      (onPhase) => swapExactIn(address, maturity, 'PtToSy', ptToSell, minOut, onPhase),
      () => {
        setAmount('')
        setPtToSell(null)
        onSuccess()
      },
    )
  }

  const step2 = ptToSell !== null

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-400">
        Split SY into PT + YT, then sell the PT — you keep the <span className="text-neutral-200">YT</span> for
        pure yield exposure. Two transactions.
      </p>

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
        disabled={step2}
        onMax={syBalance > 0n && !step2 ? () => { setAmount(stroopsToXlm(syBalance)) } : undefined}
      />

      {projected > 0n && (
        <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3.5">
          <SummaryRow label="YT you keep" accent>
            {formatAmount(projected)} YT
          </SummaryRow>
          <SummaryRow label="PT sold back for">≈ {formatAmount(sellBack)} SY</SummaryRow>
          <SummaryRow label="Net cost">≈ {formatAmount(netCost)} SY</SummaryRow>
          <div className="border-t border-neutral-800 pt-2">
            <SlippageControl bps={slippageBps} onChange={setSlippageBps} />
          </div>
        </div>
      )}

      {/* Stage indicators */}
      <ol className="flex items-center gap-2 text-xs">
        <StageChip n={1} label="Split" done={step2} active={!step2} />
        <span className="h-px flex-1 bg-neutral-800" />
        <StageChip n={2} label="Sell PT" done={false} active={step2} />
      </ol>

      {!step2 ? (
        <ActionButton
          onClick={doSplit}
          disabled={isWrongNetwork || !valid.ok || projected <= 0n}
          pending={split.pending}
          pendingLabel="Splitting…"
        >
          Step 1 — Split SY
        </ActionButton>
      ) : (
        <ActionButton
          onClick={doSell}
          disabled={isWrongNetwork || ptToSell === null || ptToSell <= 0n}
          pending={sell.pending}
          pendingLabel="Selling PT…"
        >
          Step 2 — Sell {formatAmount(ptToSell ?? 0n)} PT
        </ActionButton>
      )}

      {isWrongNetwork && (
        <p className="text-center text-xs text-warning-300">Switch your wallet to Testnet to continue.</p>
      )}
      {split.outcome && <TxStatus outcome={split.outcome} />}
      {sell.outcome && <TxStatus outcome={sell.outcome} />}
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
            ? 'bg-neutral-800 text-neutral-100'
            : 'text-neutral-500'
      }`}
    >
      <span
        className={`grid h-4 w-4 place-items-center rounded-full text-[10px] ${
          done ? 'bg-accent-500 text-neutral-950' : active ? 'bg-neutral-700 text-neutral-100' : 'bg-neutral-800 text-neutral-500'
        }`}
      >
        {done ? '✓' : n}
      </span>
      {label}
    </span>
  )
}
