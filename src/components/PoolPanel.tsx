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
import { LayersIcon } from './icons'

interface PoolPanelProps {
  address: string
  isWrongNetwork: boolean
  pools: MaturityPool[]
  positions: MaturityPosition[]
  syBalance: bigint
  /** A maturity to preselect (e.g. "Manage" clicked from Portfolio). */
  initialMaturity: bigint | null
  onSuccess: () => void
}

type Mode = 'add' | 'remove'

export function PoolPanel({
  address,
  isWrongNetwork,
  pools,
  positions,
  syBalance,
  initialMaturity,
  onSuccess,
}: PoolPanelProps): ReactElement {
  const now = useNow()
  const [mode, setMode] = useState<Mode>('add')
  const [maturity, setMaturity] = useState<bigint | null>(null)

  const withPool = pools.filter((p) => p.pool !== null)
  const preselect =
    (initialMaturity !== null && withPool.some((p) => p.maturity === initialMaturity)
      ? initialMaturity
      : withPool[0]?.maturity) ?? null
  const selected =
    maturity !== null && withPool.some((p) => p.maturity === maturity) ? maturity : preselect
  const mp = withPool.find((p) => p.maturity === selected) ?? null
  const ptBalance = positions.find((p) => p.maturity === selected)?.position.pt ?? 0n
  const matured = selected !== null && Number(selected) * 1000 <= now

  return (
    <section
      id="panel-pool"
      role="tabpanel"
      aria-labelledby="tab-pool"
      className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 sm:p-6"
    >
      <div className="flex items-center gap-2">
        <LayersIcon className="h-4 w-4 text-neutral-400" />
        <h2 className="text-sm font-medium text-neutral-400">Provide liquidity</h2>
      </div>

      {withPool.length === 0 || mp === null || selected === null ? (
        <p className="mt-4 text-sm text-neutral-400">No pools exist yet.</p>
      ) : (
        <>
          <div className="mt-4">
            <MaturitySelect
              options={withPool.map((p) => ({
                maturity: p.maturity,
                matured: Number(p.maturity) * 1000 <= now,
              }))}
              value={selected}
              onChange={setMaturity}
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
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-neutral-400">{label}</span>
      <span className="font-mono tabular-nums text-neutral-200">{children}</span>
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
}: AddFormProps): ReactElement {
  const [amount, setAmount] = useState('')
  const [slippageBps, setSlippageBps] = useState(50)
  const { outcome, pending, run } = useTxRunner()
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
    if (!canSubmit || pending) return
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
        disabled={matured}
        onMax={syBalance > 0n && !matured ? () => { setAmount(stroopsToXlm(syBalance)) } : undefined}
      />

      {syIn > 0n && (
        <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3.5">
          <Row label="PT required">{formatAmount(ptNeeded)} PT</Row>
          <Row label="SY deposited">{formatAmount(quote.syIn)} SY</Row>
          <Row label="LP shares">{formatAmount(quote.lpMinted)}</Row>
          <div className="border-t border-neutral-800 pt-2">
            <SlippageControl bps={slippageBps} onChange={setSlippageBps} />
          </div>
        </div>
      )}

      {syIn > 0n && !enoughPt && (
        <p className="text-xs text-amber-300">
          You need {formatAmount(ptNeeded)} PT to pair with that SY — split more SY (Advanced) or
          reduce the amount.
        </p>
      )}

      <ActionButton
        onClick={submit}
        disabled={isWrongNetwork || !canSubmit}
        pending={pending}
        pendingLabel="Adding…"
      >
        {matured ? 'Pool matured — adds closed' : 'Add liquidity'}
      </ActionButton>

      {isWrongNetwork && (
        <p className="text-center text-xs text-amber-300">Switch your wallet to Testnet to continue.</p>
      )}
      {outcome && <TxStatus outcome={outcome} />}
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
  const { outcome, pending, run } = useTxRunner()
  const pool = mp.pool
  if (pool === null) return <></>

  const valid = isValidTokenAmount(amount, mp.lpBalance, { label: 'LP' })
  const lp = valid.ok ? valid.stroops : 0n
  const quote = quoteRemoveLiquidity(
    { ptReserve: pool.ptReserve, syReserve: pool.syReserve, lpTotal: pool.lpTotal },
    lp,
  )

  function submit(): void {
    if (!valid.ok || lp <= 0n || pending) return
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
        onMax={mp.lpBalance > 0n ? () => { setAmount(stroopsToXlm(mp.lpBalance)) } : undefined}
      />

      {lp > 0n && (
        <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3.5">
          <Row label="PT returned">{formatAmount(quote.ptOut)} PT</Row>
          <Row label="SY returned">{formatAmount(quote.syOut)} SY</Row>
          <div className="border-t border-neutral-800 pt-2">
            <SlippageControl bps={slippageBps} onChange={setSlippageBps} />
          </div>
        </div>
      )}

      {mp.lpBalance === 0n && (
        <p className="text-xs text-neutral-400">
          You have no LP shares in the {formatMaturity(maturity)} pool.
        </p>
      )}

      <ActionButton
        onClick={submit}
        disabled={isWrongNetwork || !valid.ok || lp <= 0n}
        pending={pending}
        pendingLabel="Removing…"
      >
        Remove liquidity
      </ActionButton>

      {isWrongNetwork && (
        <p className="text-center text-xs text-amber-300">Switch your wallet to Testnet to continue.</p>
      )}
      {outcome && <TxStatus outcome={outcome} />}
    </div>
  )
}
