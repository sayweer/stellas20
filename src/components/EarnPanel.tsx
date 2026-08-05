import type { KeyboardEvent, ReactElement } from 'react'
import type { MaturityPool } from '../hooks/usePools'
import type { MaturityPosition } from '../hooks/usePortfolio'
import { PoolPanel } from './PoolPanel'
import { TradePanel } from './TradePanel'
import type { EarnStrategy } from './OverviewPanel'
import { ChartBarIcon, DropletIcon, LockIcon } from './icons'

interface EarnPanelProps {
  strategy: EarnStrategy
  onStrategyChange: (strategy: EarnStrategy) => void
  address: string
  isWrongNetwork: boolean
  pools: MaturityPool[]
  poolsLoading: boolean
  positions: MaturityPosition[]
  syBalance: bigint
  liveRate: bigint | null
  tradeMaturity: bigint | null
  poolMaturity: bigint | null
  onMaturityChange: (maturity: bigint) => void
  onSuccess: () => void
  onConvert: () => void
}

const STRATEGIES = [
  {
    id: 'fixed',
    title: 'Fixed return',
    detail: 'Buy PT below its maturity value.',
    Icon: LockIcon,
  },
  {
    id: 'yield',
    title: 'Yield exposure',
    detail: 'Keep the variable yield with YT.',
    Icon: ChartBarIcon,
  },
  {
    id: 'liquidity',
    title: 'Trading fees',
    detail: 'Provide PT + SY and earn swap fees.',
    Icon: DropletIcon,
  },
] as const

/** One destination for every earning intent; protocol primitives stay contextual. */
export function EarnPanel({
  strategy,
  onStrategyChange,
  address,
  isWrongNetwork,
  pools,
  poolsLoading,
  positions,
  syBalance,
  liveRate,
  tradeMaturity,
  poolMaturity,
  onMaturityChange,
  onSuccess,
  onConvert,
}: EarnPanelProps): ReactElement {
  function moveStrategyFocus(currentIndex: number, event: KeyboardEvent): void {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % STRATEGIES.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + STRATEGIES.length) % STRATEGIES.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = STRATEGIES.length - 1
    }
    if (nextIndex === null) return
    event.preventDefault()
    const next = STRATEGIES[nextIndex]
    onStrategyChange(next.id)
    window.requestAnimationFrame(() => {
      document.getElementById(`strategy-${next.id}`)?.focus()
    })
  }

  return (
    <section id="panel-earn" role="tabpanel" aria-labelledby="tab-earn" className="space-y-8">
      <header className="max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent-300">Earn</p>
        <h1
          data-panel-heading
          tabIndex={-1}
          className="mt-3 text-3xl font-medium tracking-[-0.045em] text-neutral-50 outline-none sm:text-4xl"
        >
          Choose the outcome.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-neutral-400">
          Start with what you want to achieve. The review shows exactly what moves before your
          wallet opens.
        </p>
      </header>

      <fieldset>
        <legend className="sr-only">Earning strategy</legend>
        <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
          {STRATEGIES.map(({ id, title, detail, Icon }, index) => {
            const selected = strategy === id
            return (
              <button
                key={id}
                id={`strategy-${id}`}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => onStrategyChange(id)}
                onKeyDown={(event) => moveStrategyFocus(index, event)}
                className={`min-h-28 rounded-2xl border p-4 text-left transition-[color,background-color,border-color] duration-100 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 ${
                  selected
                    ? 'border-accent-500 bg-accent-500 text-onAccent'
                    : 'border-boundary bg-neutral-900 text-neutral-100 hover:bg-neutral-850'
                }`}
              >
                <span className="flex items-center justify-between gap-3">
                  <Icon className="h-5 w-5" />
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 rounded-full border ${
                      selected ? 'border-onAccent bg-onAccent' : 'border-neutral-600'
                    }`}
                  />
                </span>
                <span className="mt-5 block text-sm font-semibold">{title}</span>
                <span
                  className={`mt-1 block text-xs leading-relaxed ${selected ? 'text-onAccent/75' : 'text-neutral-400'}`}
                >
                  {detail}
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <details className="max-w-2xl rounded-xl border border-hairline bg-neutral-900 px-4 py-2 text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center rounded font-medium text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300">
          What do SY, PT, and YT mean?
        </summary>
        <dl className="grid gap-4 border-t border-hairline py-4 text-xs leading-relaxed text-neutral-400 sm:grid-cols-3">
          <div>
            <dt className="font-mono font-semibold text-neutral-200">SY</dt>
            <dd className="mt-1">
              The yield-bearing asset format used by every Everspan strategy.
            </dd>
          </div>
          <div>
            <dt className="font-mono font-semibold text-neutral-200">PT</dt>
            <dd className="mt-1">Principal that can be redeemed for its maturity value.</dd>
          </div>
          <div>
            <dt className="font-mono font-semibold text-neutral-200">YT</dt>
            <dd className="mt-1">The yield released by the position before maturity.</dd>
          </div>
        </dl>
      </details>

      <div className="max-w-2xl rounded-2xl border border-hairline bg-neutral-900 p-5 sm:p-6">
        {strategy === 'liquidity' ? (
          <PoolPanel
            key="liquidity"
            address={address}
            isWrongNetwork={isWrongNetwork}
            pools={pools}
            positions={positions}
            loading={poolsLoading}
            syBalance={syBalance}
            initialMaturity={poolMaturity}
            onMaturityChange={onMaturityChange}
            onSuccess={onSuccess}
            onGoAdvanced={onConvert}
          />
        ) : (
          <TradePanel
            key={strategy}
            mode={strategy === 'fixed' ? 'lock' : 'long'}
            address={address}
            isWrongNetwork={isWrongNetwork}
            pools={pools}
            positions={positions}
            loading={poolsLoading}
            syBalance={syBalance}
            liveRate={liveRate}
            initialMaturity={tradeMaturity}
            onMaturityChange={onMaturityChange}
            onSuccess={onSuccess}
            onGoAdvanced={onConvert}
          />
        )}
      </div>
    </section>
  )
}
