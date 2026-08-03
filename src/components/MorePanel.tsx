import type { ReactElement } from 'react'
import type { Portfolio } from '../hooks/usePortfolio'
import type { ProtocolEvent } from '../lib/events'
import type { AppError } from '../types'
import { ActivityFeed } from './ActivityFeed'
import { AdvancedPanel } from './AdvancedPanel'
import { ConnectPrompt } from './ConnectPrompt'
import { TabToggle } from './forms'
import { DataUnavailable } from './DataUnavailable'

export type MoreView = 'convert' | 'activity'

interface MorePanelProps {
  view: MoreView
  onViewChange: (view: MoreView) => void
  address: string | null
  portfolio: Portfolio
  liveRate: bigint | null
  loading: boolean
  isWrongNetwork: boolean
  onSuccess: () => void
  events: ProtocolEvent[]
  activityLoading: boolean
  activityError: AppError | null
  onRetryActivity: () => void
  dataError: AppError | null
  onRetryData: () => void
}

/** Secondary tools are available without competing with the four primary destinations. */
export function MorePanel({
  view,
  onViewChange,
  address,
  portfolio,
  liveRate,
  loading,
  isWrongNetwork,
  onSuccess,
  events,
  activityLoading,
  activityError,
  onRetryActivity,
  dataError,
  onRetryData,
}: MorePanelProps): ReactElement {
  return (
    <section id="panel-more" role="tabpanel" aria-labelledby="tab-more" className="space-y-8">
      <header className="max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent-300">More</p>
        <h1 className="mt-3 text-3xl font-medium tracking-[-0.045em] text-neutral-50 sm:text-4xl">
          Tools and activity.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-neutral-400">
          Convert assets or inspect protocol events. These tools are useful, but they are not the
          starting point.
        </p>
      </header>

      <TabToggle
        label="Secondary tools"
        options={[
          { id: 'convert', label: 'Convert assets' },
          { id: 'activity', label: 'Protocol activity' },
        ]}
        active={view}
        onChange={(id) => onViewChange(id as MoreView)}
      />

      {view === 'convert' && address !== null && dataError ? (
        <DataUnavailable error={dataError} onRetry={onRetryData} />
      ) : view === 'convert' && address !== null ? (
        <AdvancedPanel
          address={address}
          portfolio={portfolio}
          liveRate={liveRate}
          loading={loading}
          isWrongNetwork={isWrongNetwork}
          onSuccess={onSuccess}
        />
      ) : view === 'convert' ? (
        <ConnectPrompt
          tab="more"
          embedded
          message="Connect a Testnet wallet to convert an asset into SY or manually split a position."
        />
      ) : (
        <ActivityFeed
          events={events}
          loading={activityLoading}
          error={activityError}
          onRetry={onRetryActivity}
        />
      )}
    </section>
  )
}
