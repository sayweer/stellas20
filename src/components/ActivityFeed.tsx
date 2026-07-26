/** Live protocol activity feed, driven by polled contract events. */
import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { explorerTxUrl } from '../config'
import { formatAmount, formatRelativeTime, truncateAddress } from '../lib/format'
import { chainNowMs } from '../lib/chainTime'
import { activeMarket } from '../lib/market'
import type { ProtocolEvent, ProtocolEventType } from '../lib/events'
import { ExternalLinkIcon } from './icons'

/**
 * Display label, dot colour, and default amount unit per event type. A null
 * unit means the amount is denominated in the market's underlying, whose
 * ticker depends on which market is active.
 *
 * The dot encodes direction, not event identity: value entering a position is
 * light, value leaving it is dark, and claimed yield is the one genuinely
 * positive outcome. Ten distinct hues made the feed read as decoration and
 * spent the accent — which belongs to interactive elements — on data.
 */
const IN = 'bg-neutral-300'
const OUT = 'bg-neutral-600'

const META: Record<ProtocolEventType, { label: string; dot: string; unit: string | null }> = {
  faucet: { label: 'Faucet', dot: IN, unit: null },
  wrap: { label: 'Wrap', dot: IN, unit: null },
  unwrap: { label: 'Unwrap', dot: OUT, unit: 'SY' },
  split: { label: 'Split', dot: IN, unit: 'SY' },
  merge: { label: 'Merge', dot: OUT, unit: 'SY' },
  yield_claim: { label: 'Claim', dot: 'bg-positive-400', unit: 'SY' },
  pt_redeem: { label: 'Redeem', dot: OUT, unit: 'SY' },
  swap: { label: 'Swap', dot: IN, unit: 'SY' },
  liquidity_added: { label: 'Add LP', dot: IN, unit: 'SY' },
  liquidity_removed: { label: 'Remove LP', dot: OUT, unit: 'SY' },
}

interface ActivityFeedProps {
  events: ProtocolEvent[]
}

export function ActivityFeed({ events }: ActivityFeedProps): ReactElement {
  const underlyingSymbol = activeMarket().underlyingSymbol
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
      id="panel-activity"
      role="tabpanel"
      aria-labelledby="tab-activity"
    >
      <h2 className="text-lg font-medium tracking-[-0.02em] text-neutral-100">Activity</h2>
      <p className="mt-1 text-sm text-neutral-400">
        Live protocol events, polled from the contracts.
      </p>

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
                    {formatAmount(event.amount)} {event.unit ?? meta.unit ?? underlyingSymbol}
                  </span>
                  <a
                    href={explorerTxUrl(event.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="View transaction on Stellar Expert"
                    className="-m-2 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-neutral-400 transition-colors hover:text-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60"
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
