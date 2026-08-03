import type { ReactElement } from 'react'
import type { MaturityPool } from '../hooks/usePools'
import type { MaturityPosition } from '../hooks/usePortfolio'
import type { RateInfo } from '../lib/contracts/underlying'
import type { AppError } from '../types'
import { activeMarket } from '../lib/market'
import { MarketsList } from './MarketsList'
import { ArrowRightIcon, ChartBarIcon, DropletIcon, LayersIcon, LockIcon } from './icons'

export type EarnStrategy = 'fixed' | 'yield' | 'liquidity'

interface OverviewPanelProps {
  connected: boolean
  underlying: bigint
  sy: bigint
  positions: MaturityPosition[]
  loading: boolean
  pools: MaturityPool[]
  rateInfo: RateInfo | null
  liveRate: bigint | null
  error: AppError | null
  onRetry: () => void
  onEarn: (strategy: EarnStrategy, maturity?: bigint) => void
  onConvert: () => void
  onPortfolio: () => void
}

/** Goal-first home: one recommended next step, then three outcomes in plain language. */
export function OverviewPanel({
  connected,
  underlying,
  sy,
  positions,
  loading,
  pools,
  rateInfo,
  liveRate,
  error,
  onRetry,
  onEarn,
  onConvert,
  onPortfolio,
}: OverviewPanelProps): ReactElement {
  const market = activeMarket()
  const hasPosition =
    positions.some(
      ({ position }) => position.pt > 0n || position.yt > 0n || position.claimable > 0n,
    ) || pools.some((pool) => pool.lpBalance > 0n)

  const recommendation = !connected
    ? {
        label: 'Explore before connecting',
        title: 'See the outcome first.',
        body: 'Compare live maturities below. Connect your wallet only when you are ready to act.',
        action: null,
        actionLabel: null,
      }
    : error
      ? {
          label: 'Data unavailable',
          title: 'We couldn’t load your balances.',
          body: 'Your assets have not changed. Retry the read before choosing an action.',
          action: onRetry,
          actionLabel: 'Try again',
        }
      : underlying === 0n && sy === 0n && !hasPosition
        ? {
            label: 'Your next step',
            title: 'Fund your test wallet.',
            body:
              market.source === 'mock'
                ? `Use the faucet in the wallet bar above to receive ${market.underlyingSymbol}. No real funds are used.`
                : (market.fundingHint ??
                  `Add ${market.underlyingSymbol} to this Testnet wallet before continuing.`),
            action: null,
            actionLabel: null,
          }
        : underlying > 0n && sy === 0n
          ? {
              label: 'Recommended next',
              title: 'Prepare your asset once.',
              body: `Convert ${market.underlyingSymbol} into SY before choosing a fixed return or yield exposure.`,
              action: onConvert,
              actionLabel: 'Convert to SY',
            }
          : sy > 0n && !hasPosition
            ? {
                label: 'Recommended next',
                title: 'Choose your return.',
                body: 'Use your SY to lock a maturity-based rate or keep exposure to the variable yield.',
                action: () => onEarn('fixed'),
                actionLabel: 'Compare fixed returns',
              }
            : {
                label: 'Position ready',
                title: 'Your position is working.',
                body: 'Review what you hold, claim available yield, or manage an existing liquidity position.',
                action: onPortfolio,
                actionLabel: 'Open portfolio',
              }

  return (
    <section
      id="panel-overview"
      role="tabpanel"
      aria-labelledby="tab-overview"
      className="space-y-10"
    >
      <header className="max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent-300">
          Overview
        </p>
        <h1
          data-panel-heading
          tabIndex={-1}
          className="mt-3 text-3xl font-medium tracking-[-0.045em] text-neutral-50 outline-none sm:text-4xl"
        >
          What do you want your yield to do?
        </h1>
        <p className="mt-3 text-base leading-relaxed text-neutral-400">
          Choose an outcome first. Everspan shows the token mechanics only when they matter.
        </p>
      </header>

      <div className="grid overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="p-6 sm:p-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent-300">
            {recommendation.label}
          </p>
          {loading && connected ? (
            <div
              role="status"
              aria-live="polite"
              aria-label="Loading your next step"
              className="mt-5 space-y-3"
            >
              <div className="h-9 w-3/4 animate-pulse rounded bg-neutral-800" />
              <div className="h-4 w-full animate-pulse rounded bg-neutral-800" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-neutral-800" />
            </div>
          ) : (
            <>
              <h2 className="mt-4 text-3xl font-medium tracking-[-0.04em] text-neutral-50">
                {recommendation.title}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-400">
                {recommendation.body}
              </p>
              {recommendation.action && recommendation.actionLabel && (
                <button
                  type="button"
                  onClick={recommendation.action}
                  className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent-500 px-5 py-2.5 text-sm font-semibold text-onAccent transition-[transform,background-color] duration-100 ease-out hover:-translate-y-0.5 hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 active:translate-y-px motion-reduce:transform-none"
                >
                  {recommendation.actionLabel}
                  <ArrowRightIcon className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>

        <div className="border-t border-neutral-800 lg:border-l lg:border-t-0">
          <GoalRow
            icon={<LockIcon className="h-5 w-5" />}
            title="Lock a fixed return"
            detail="Know the maturity and implied rate before signing."
            onClick={() => onEarn('fixed')}
          />
          <GoalRow
            icon={<ChartBarIcon className="h-5 w-5" />}
            title="Increase yield exposure"
            detail="Hold the variable yield released before maturity."
            onClick={() => onEarn('yield')}
          />
          <GoalRow
            icon={<DropletIcon className="h-5 w-5" />}
            title="Earn trading fees"
            detail="Provide liquidity and earn the 0.30% swap fee."
            onClick={() => onEarn('liquidity')}
          />
        </div>
      </div>

      <div className="border-t border-neutral-800 pt-8">
        <div className="mb-2 flex items-center gap-2 text-neutral-500">
          <LayersIcon className="h-4 w-4" />
          <p className="font-mono text-[11px] uppercase tracking-[0.16em]">Live opportunities</p>
        </div>
        <MarketsList
          pools={pools}
          loading={loading}
          rateInfo={rateInfo}
          liveRate={liveRate}
          onTrade={(maturity) => onEarn('fixed', maturity)}
        />
      </div>
    </section>
  )
}

function GoalRow({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: ReactElement
  title: string
  detail: string
  onClick: () => void
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-24 w-full items-center gap-4 border-b border-neutral-800 px-5 py-4 text-left transition-colors duration-100 ease-out last:border-b-0 hover:bg-neutral-850 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-300 sm:px-6"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-neutral-850 text-neutral-300">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-neutral-100">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-neutral-400">{detail}</span>
      </span>
      <ArrowRightIcon className="h-4 w-4 shrink-0 text-neutral-500 transition-transform duration-100 ease-out group-hover:translate-x-0.5 motion-reduce:transform-none" />
    </button>
  )
}
