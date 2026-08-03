/** Pool tab: provide or withdraw PT/SY liquidity and earn swap fees. */
import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { MaturityPool } from '../hooks/usePools'
import type { MaturityPosition } from '../hooks/usePortfolio'
import { useNow } from '../hooks/useNow'
import { useTxRunner } from '../hooks/useTxRunner'
import { stroopsToXlm } from '../lib/amounts'
import { formatAmount, formatMaturity } from '../lib/format'
import { isValidTokenAmount } from '../lib/validation'
import { minOutFromSlippage, quoteAddLiquidity, quoteRemoveLiquidity } from '../lib/amm'
import { addLiquidity, removeLiquidity } from '../lib/contracts/amm'
import { AmountField, ActionButton, TabToggle } from './forms'
import { MaturitySelect } from './MaturitySelect'
import { SlippageControl } from './SlippageControl'
import { TxStatus } from './TxStatus'

interface PoolPanelProps {
  address: string
  isWrongNetwork: boolean
  pools: MaturityPool[]
  loading: boolean
  positions: MaturityPosition[]
  syBalance: bigint
  /** A maturity to preselect (e.g. "Manage" clicked from Portfolio). */
  initialMaturity: bigint | null
  onMaturityChange: (maturity: bigint) => void
  onSuccess: () => void
  /** Jump to the Advanced tab — the only place SY can be split into PT. */
  onGoAdvanced: () => void
}

type Mode = 'add' | 'remove'

export function PoolPanel({
  address,
  isWrongNetwork,
  pools,
  loading,
  positions,
  syBalance,
  initialMaturity,
  onMaturityChange,
  onSuccess,
  onGoAdvanced,
}: PoolPanelProps): ReactElement {
  const now = useNow()
  const [mode, setMode] = useState<Mode>('add')

  const withPool = pools.filter((p) => p.pool !== null)
  const firstActive = withPool.find((p) => Number(p.maturity) * 1000 > now)?.maturity
  const preselect =
    (initialMaturity !== null && withPool.some((p) => p.maturity === initialMaturity)
      ? initialMaturity
      : (firstActive ?? withPool[0]?.maturity)) ?? null
  const selected = preselect
  const mp = withPool.find((p) => p.maturity === selected) ?? null
  const ptBalance = positions.find((p) => p.maturity === selected)?.position.pt ?? 0n
  const matured = selected !== null && Number(selected) * 1000 <= now

  return (
    <div>
      <header>
        <h2 className="text-lg font-medium tracking-[-0.02em] text-neutral-100">
          Provide liquidity
        </h2>
        <p className="mt-1 text-sm text-neutral-400">
          Deposit PT and SY into a maturity's pool to earn the 0.30% swap fee.
        </p>
      </header>

      {loading ? (
        <div
          role="status"
          aria-live="polite"
          aria-label="Loading liquidity pools"
          className="mt-5 space-y-3"
        >
          <div className="h-11 animate-pulse rounded-lg bg-neutral-850" />
          <div className="h-28 animate-pulse rounded-xl bg-neutral-850" />
        </div>
      ) : withPool.length === 0 || mp === null || selected === null ? (
        <p className="mt-4 text-sm text-neutral-400">No liquidity pool is available right now.</p>
      ) : (
        <>
          <div className="mt-4">
            <MaturitySelect
              options={withPool.map((p) => ({
                maturity: p.maturity,
                matured: Number(p.maturity) * 1000 <= now,
              }))}
              value={selected}
              onChange={onMaturityChange}
            />
          </div>

          <TabToggle
            className="mt-4"
            label="Add or remove liquidity"
            options={[
              { id: 'add', label: 'Add' },
              { id: 'remove', label: 'Remove' },
            ]}
            active={mode}
            onChange={(id) => {
              setMode(id as Mode)
            }}
          />

          <div className="mt-5">
            {mode === 'add' ? (
              <AddForm
                key={`add-${selected.toString()}`}
                address={address}
                isWrongNetwork={isWrongNetwork}
                maturity={selected}
                mp={mp}
                ptBalance={ptBalance}
                syBalance={syBalance}
                matured={matured}
                onSuccess={onSuccess}
                onGoAdvanced={onGoAdvanced}
              />
            ) : (
              <RemoveForm
                key={`remove-${selected.toString()}`}
                address={address}
                isWrongNetwork={isWrongNetwork}
                maturity={selected}
                mp={mp}
                onSuccess={onSuccess}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] items-start gap-3 text-sm">
      <span className="text-neutral-400">{label}</span>
      <span className="min-w-0 break-all text-right font-mono tabular-nums text-neutral-200">
        {children}
      </span>
    </div>
  )
}

interface AddFormProps {
  address: string
  isWrongNetwork: boolean
  maturity: bigint
  mp: MaturityPool
  ptBalance: bigint
  syBalance: bigint
  matured: boolean
  onSuccess: () => void
  onGoAdvanced: () => void
}

/** Deposit SY + the matching PT at the pool ratio. */
function AddForm({
  address,
  isWrongNetwork,
  maturity,
  mp,
  ptBalance,
  syBalance,
  matured,
  onSuccess,
  onGoAdvanced,
}: AddFormProps): ReactElement {
  const [amount, setAmount] = useState('')
  const [slippageBps, setSlippageBps] = useState(50)
  const { outcome, pending, blocked, run } = useTxRunner()
  const pool = mp.pool
  if (pool === null) return <></>

  const valid = isValidTokenAmount(amount, syBalance, { label: 'SY' })
  const syIn = valid.ok ? valid.stroops : 0n
  // PT needed to pair with syIn at the current ratio.
  const ptNeeded = syIn > 0n ? (syIn * pool.ptReserve) / pool.syReserve : 0n
  const quote = quoteAddLiquidity(
    { ptReserve: pool.ptReserve, syReserve: pool.syReserve, lpTotal: pool.lpTotal },
    ptNeeded,
    syIn,
  )
  const enoughPt = ptNeeded <= ptBalance
  const canSubmit = valid.ok && syIn > 0n && quote.lpMinted > 0n && enoughPt && !matured

  function submit(): void {
    if (!canSubmit || pending || blocked) return
    const ptMin = minOutFromSlippage(quote.ptIn, slippageBps)
    const syMin = minOutFromSlippage(quote.syIn, slippageBps)
    void run(
      'Add liquidity',
      (onPhase) => addLiquidity(address, maturity, ptNeeded, syIn, ptMin, syMin, onPhase),
      () => {
        setAmount('')
        onSuccess()
      },
    )
  }

  return (
    <div className="space-y-4">
      <AmountField
        id="add-sy"
        value={amount}
        onChange={setAmount}
        unit="SY"
        hint={`Available: ${formatAmount(syBalance)} SY · your PT: ${formatAmount(ptBalance)}`}
        error={amount.trim() !== '' && !valid.ok ? valid.reason : null}
        onEnter={submit}
        disabled={matured || blocked}
        onMax={
          syBalance > 0n && !matured && !blocked
            ? () => {
                setAmount(stroopsToXlm(syBalance))
              }
            : undefined
        }
      />

      {syIn > 0n && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
          <p className="text-sm font-semibold text-neutral-100">Review liquidity deposit</p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-400">
            Both assets enter the same maturity pool in one transaction.
          </p>
          <div className="mt-4 space-y-2.5">
            <Row label="You provide">{formatAmount(quote.syIn)} SY</Row>
            <Row label="PT paired">{formatAmount(ptNeeded)} PT</Row>
            <Row label="LP shares received">{formatAmount(quote.lpMinted)} LP</Row>
            <Row label="Pool swap fee rate">0.30%</Row>
          </div>
          <p className="mt-4 border-t border-neutral-800 pt-3 text-xs leading-relaxed text-neutral-400">
            Future swaps pay a 0.30% fee shared pro-rata among liquidity providers. The value and
            PT/SY mix of your position can change before you withdraw.
          </p>
          <details className="mt-3 border-t border-neutral-800 pt-3 text-xs">
            <summary className="flex min-h-11 cursor-pointer items-center rounded py-2 font-medium text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300">
              Slippage and fee details
            </summary>
            <div className="mt-2 space-y-2.5 pb-1">
              <Row label="Maximum slippage">{(slippageBps / 100).toFixed(2)}%</Row>
              <SlippageControl bps={slippageBps} onChange={setSlippageBps} />
              <p className="text-neutral-500">
                Your wallet shows the final Stellar network fee before approval.
              </p>
            </div>
          </details>
        </div>
      )}

      {syIn > 0n && !enoughPt && (
        <p className="text-xs text-warning-300">
          You need {formatAmount(ptNeeded)} PT to pair with that SY — reduce the amount, or{' '}
          <button
            type="button"
            onClick={onGoAdvanced}
            className="ml-1 inline-flex min-h-11 items-center rounded-md border border-boundary px-3 font-medium transition-colors hover:bg-neutral-800 hover:text-warning-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
          >
            prepare PT in Convert
          </button>
          .
        </p>
      )}

      <ActionButton
        onClick={submit}
        disabled={isWrongNetwork || blocked || !canSubmit}
        pending={pending}
        pendingLabel="Adding…"
      >
        {matured ? 'Pool matured — adds closed' : 'Confirm liquidity deposit'}
      </ActionButton>

      {isWrongNetwork && (
        <p className="text-center text-xs text-warning-300">
          Switch your wallet to Testnet to continue.
        </p>
      )}
      {outcome && <TxStatus outcome={outcome} onRetry={submit} />}
    </div>
  )
}

interface RemoveFormProps {
  address: string
  isWrongNetwork: boolean
  maturity: bigint
  mp: MaturityPool
  onSuccess: () => void
}

/** Burn LP shares for the pro-rata PT + SY (allowed even after maturity). */
function RemoveForm({
  address,
  isWrongNetwork,
  maturity,
  mp,
  onSuccess,
}: RemoveFormProps): ReactElement {
  const [amount, setAmount] = useState('')
  const [slippageBps, setSlippageBps] = useState(50)
  const { outcome, pending, blocked, run } = useTxRunner()
  const pool = mp.pool
  if (pool === null) return <></>

  const valid = isValidTokenAmount(amount, mp.lpBalance, { label: 'LP' })
  const lp = valid.ok ? valid.stroops : 0n
  const quote = quoteRemoveLiquidity(
    { ptReserve: pool.ptReserve, syReserve: pool.syReserve, lpTotal: pool.lpTotal },
    lp,
  )

  function submit(): void {
    if (!valid.ok || lp <= 0n || pending || blocked) return
    const ptMin = minOutFromSlippage(quote.ptOut, slippageBps)
    const syMin = minOutFromSlippage(quote.syOut, slippageBps)
    void run(
      'Remove liquidity',
      (onPhase) => removeLiquidity(address, maturity, lp, ptMin, syMin, onPhase),
      () => {
        setAmount('')
        onSuccess()
      },
    )
  }

  return (
    <div className="space-y-4">
      <AmountField
        id="remove-lp"
        value={amount}
        onChange={setAmount}
        unit="LP"
        hint={`Your LP shares: ${formatAmount(mp.lpBalance)}`}
        error={amount.trim() !== '' && !valid.ok ? valid.reason : null}
        onEnter={submit}
        disabled={blocked}
        onMax={
          mp.lpBalance > 0n && !blocked
            ? () => {
                setAmount(stroopsToXlm(mp.lpBalance))
              }
            : undefined
        }
      />

      {lp > 0n && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
          <p className="text-sm font-semibold text-neutral-100">Review withdrawal</p>
          <div className="mt-4 space-y-2.5">
            <Row label="LP shares burned">{formatAmount(lp)} LP</Row>
            <Row label="PT returned">{formatAmount(quote.ptOut)} PT</Row>
            <Row label="SY returned">{formatAmount(quote.syOut)} SY</Row>
          </div>
          <details className="mt-3 border-t border-neutral-800 pt-3 text-xs">
            <summary className="flex min-h-11 cursor-pointer items-center rounded py-2 font-medium text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300">
              Slippage and fee details
            </summary>
            <div className="mt-2 space-y-2.5 pb-1">
              <Row label="Maximum slippage">{(slippageBps / 100).toFixed(2)}%</Row>
              <SlippageControl bps={slippageBps} onChange={setSlippageBps} />
              <p className="text-neutral-500">
                Your wallet shows the final Stellar network fee before approval.
              </p>
            </div>
          </details>
        </div>
      )}

      {mp.lpBalance === 0n && (
        <p className="text-xs text-neutral-400">
          You have no LP shares in the {formatMaturity(maturity)} pool.
        </p>
      )}

      <ActionButton
        onClick={submit}
        disabled={isWrongNetwork || blocked || !valid.ok || lp <= 0n}
        pending={pending}
        pendingLabel="Removing…"
      >
        Confirm withdrawal
      </ActionButton>

      {isWrongNetwork && (
        <p className="text-center text-xs text-warning-300">
          Switch your wallet to Testnet to continue.
        </p>
      )}
      {outcome && <TxStatus outcome={outcome} onRetry={submit} />}
    </div>
  )
}
