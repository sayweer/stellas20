/** Advanced tab: the raw protocol console — wrap/unwrap and split/merge. */
import type { ReactElement } from 'react'
import { activeMarket } from '../lib/market'
import type { Portfolio } from '../hooks/usePortfolio'
import { OnboardingSteps } from './OnboardingSteps'
import { WrapCard } from './WrapCard'
import { SplitCard } from './SplitCard'

interface AdvancedPanelProps {
  address: string
  portfolio: Portfolio
  liveRate: bigint | null
  loading: boolean
  isWrongNetwork: boolean
  onSuccess: () => void
}

export function AdvancedPanel({
  address,
  portfolio,
  liveRate,
  loading,
  isWrongNetwork,
  onSuccess,
}: AdvancedPanelProps): ReactElement {
  const hasSplit = portfolio.positions.some((p) => p.position.pt > 0n || p.position.yt > 0n)

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-medium tracking-[-0.02em] text-neutral-100">
          Convert and split assets
        </h2>
        <p className="mt-1 text-sm text-neutral-400">
          Prepare {activeMarket().underlyingSymbol} for Everspan, or manually separate principal and
          yield. Most people can start from Earn instead.
        </p>
      </header>

      {!hasSplit && (
        <OnboardingSteps
          gotTokens={portfolio.underlying > 0n || portfolio.sy > 0n || hasSplit}
          wrapped={portfolio.sy > 0n || hasSplit}
          split={hasSplit}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <WrapCard
          address={address}
          underlyingBalance={portfolio.underlying}
          syBalance={portfolio.sy}
          liveRate={liveRate}
          loading={loading}
          isWrongNetwork={isWrongNetwork}
          onSuccess={onSuccess}
        />
        <SplitCard
          address={address}
          syBalance={portfolio.sy}
          positions={portfolio.positions}
          liveRate={liveRate}
          loading={loading}
          isWrongNetwork={isWrongNetwork}
          onSuccess={onSuccess}
        />
      </div>
    </div>
  )
}
