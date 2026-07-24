/** Advanced tab: the raw protocol console — wrap/unwrap and split/merge. */
import type { ReactElement } from 'react'
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
    <div id="panel-advanced" role="tabpanel" aria-labelledby="tab-advanced" className="space-y-6">
      <p className="text-sm text-neutral-400">
        The raw protocol primitives. Wrap mUSDY into SY, then split SY into PT + YT — the building
        blocks the Markets and Trade tabs sit on top of.
      </p>

      {!hasSplit && (
        <OnboardingSteps
          gotTokens={portfolio.myt > 0n || portfolio.sy > 0n || hasSplit}
          wrapped={portfolio.sy > 0n || hasSplit}
          split={hasSplit}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <WrapCard
          address={address}
          mytBalance={portfolio.myt}
          syBalance={portfolio.sy}
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
