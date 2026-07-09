/** Live deposit/withdraw activity feed, driven by polled contract events. */
import type { ReactElement } from 'react'
import { explorerTxUrl } from '../config'
import { stroopsToXlm } from '../lib/amounts'
import type { VaultEvent } from '../lib/events'
import { ExternalLinkIcon } from './icons'

function truncate(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}

/** Compact relative time (e.g. "just now", "5m ago", "3h ago"). */
function formatRelativeTime(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes.toString()}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours.toString()}h ago`
  return `${Math.floor(hours / 24).toString()}d ago`
}

interface ActivityFeedProps {
  events: VaultEvent[]
}

export function ActivityFeed({ events }: ActivityFeedProps): ReactElement {
  return (
    <section
      aria-labelledby="activity-feed-heading"
      className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 sm:p-6"
    >
      <h2 id="activity-feed-heading" className="text-sm font-medium text-neutral-400">
        Activity
      </h2>

      {events.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">No deposits or withdrawals yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800/80 px-3 py-2.5 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    event.type === 'deposit' ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                <span className="font-medium capitalize text-neutral-200">{event.type}</span>
                <span className="truncate font-mono text-xs text-neutral-500">
                  {truncate(event.address)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-neutral-500">{formatRelativeTime(event.closedAt)}</span>
                <span className="font-mono tabular-nums text-neutral-300">
                  {stroopsToXlm(event.amount)} XLM
                </span>
                <a
                  href={explorerTxUrl(event.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="View transaction on Stellar Expert"
                  className="text-neutral-500 transition-colors hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                >
                  <ExternalLinkIcon className="h-3.5 w-3.5" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
