/** Live protocol activity feed, driven by polled contract events. */
import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { explorerTxUrl } from '../config'
import { formatAmount, formatRelativeTime, truncateAddress } from '../lib/format'
import { chainNowMs } from '../lib/chainTime'
import type { ProtocolEvent, ProtocolEventType } from '../lib/events'
import { ExternalLinkIcon } from './icons'

/** Display label, dot color, and amount unit per event type. */
const META: Record<ProtocolEventType, { label: string; dot: string; unit: string }> = {
  faucet: { label: 'Faucet', dot: 'bg-sky-400', unit: 'mUSDY' },
  wrap: { label: 'Wrap', dot: 'bg-indigo-400', unit: 'mUSDY' },
  unwrap: { label: 'Unwrap', dot: 'bg-indigo-400', unit: 'SY' },
  split: { label: 'Split', dot: 'bg-emerald-400', unit: 'SY' },
  merge: { label: 'Merge', dot: 'bg-amber-400', unit: 'SY' },
  yield_claim: { label: 'Claim', dot: 'bg-emerald-400', unit: 'SY' },
  pt_redeem: { label: 'Redeem', dot: 'bg-violet-400', unit: 'SY' },
}

interface ActivityFeedProps {
  events: ProtocolEvent[]
}

export function ActivityFeed({ events }: ActivityFeedProps): ReactElement {
  // Tick every 30s so relative timestamps stay fresh between event polls. Use
  // chain time (not the local clock) since event timestamps are ledger times.
  const [nowMs, setNowMs] = useState(() => chainNowMs())
  useEffect(() => {
    const t = window.setInterval(() => {
      setNowMs(chainNowMs())
    }, 30_000)
    return () => {
      window.clearInterval(t)
    }
  }, [])

  return (
    <section
      aria-labelledby="activity-feed-heading"
      className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 sm:p-6"
    >
      <h2 id="activity-feed-heading" className="text-sm font-medium text-neutral-400">
        Activity
      </h2>

      {events.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-400">No protocol activity yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {events.map((event) => {
            const meta = META[event.type]
            return (
              <li
                key={event.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800/80 px-3 py-2.5 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                  <span className="font-medium text-neutral-200">{meta.label}</span>
                  {event.address && (
                    <span className="truncate font-mono text-xs text-neutral-400">
                      {truncateAddress(event.address)}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="hidden text-xs text-neutral-400 sm:inline">
                    {formatRelativeTime(event.closedAt, nowMs)}
                  </span>
                  <span className="font-mono tabular-nums text-neutral-300">
                    {formatAmount(event.amount)} {meta.unit}
                  </span>
                  <a
                    href={explorerTxUrl(event.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="View transaction on Stellar Expert"
                    className="-m-2 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-neutral-400 transition-colors hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                  >
                    <ExternalLinkIcon className="h-3.5 w-3.5" />
                  </a>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
