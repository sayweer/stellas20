/** Soroban event polling for the active market's live activity feed. */
import { scValToNative } from '@stellar/stellar-sdk'
import { Api, Server } from '@stellar/stellar-sdk/rpc'
import { config } from '../config'
import { noteChainTime } from './chainTime'
import { activeMarket } from './market'
import type { AppError } from '../types'

const server = new Server(config.sorobanRpcUrl)

/** User-facing event kinds shown in the activity feed. */
export type ProtocolEventType =
  | 'faucet'
  | 'wrap'
  | 'unwrap'
  | 'split'
  | 'merge'
  | 'yield_claim'
  | 'pt_redeem'
  | 'swap'
  | 'liquidity_added'
  | 'liquidity_removed'

/** A parsed, display-ready protocol event. */
export interface ProtocolEvent {
  id: string
  type: ProtocolEventType
  /** The actor (from the event's address topic), or null. */
  address: string | null
  /** A representative amount for the row (SY in/out, or token amount), in stroops. */
  amount: bigint
  /**
   * Display unit override when it can't be inferred from the type alone (a swap
   * pays out PT or SY depending on direction). Falls back to the type's unit.
   */
  unit: string | null
  /** Maturity this event relates to, when applicable. */
  maturity: bigint | null
  ledger: number
  txHash: string
  /** ISO timestamp the ledger closed at. */
  closedAt: string
}

export interface FetchEventsResult {
  events: ProtocolEvent[]
  cursor: string
}

/**
 * Ledgers to look back on the first poll (~2000 ledgers ≈ under 3 hours at
 * ~5s/ledger) — inside RPC event retention, and only used to seed the live
 * feed; the portfolio numbers always come from reads.
 */
const LOOKBACK_LEDGERS = 2000

/** Fetch recent protocol events from the active market's contracts (fresh window or from a cursor). */
export async function fetchProtocolEvents(cursor?: string): Promise<FetchEventsResult | AppError> {
  try {
    const market = activeMarket()
    const filters: Api.EventFilter[] = [
      {
        type: 'contract',
        contractIds: [
          market.underlyingContractId,
          market.syVaultContractId,
          market.splitterContractId,
          market.ammContractId,
        ],
      },
    ]
    const request: Api.GetEventsRequest = cursor
      ? { filters, cursor, limit: 50 }
      : { filters, startLedger: await resolveStartLedger(), limit: 50 }

    const response = await server.getEvents(request)
    // The response always carries the latest ledger close time (even with no
    // events) — use it to anchor the UI's countdowns and live rate to chain time.
    noteChainTime(response.latestLedgerCloseTime)
    const events = response.events
      .map(parseEvent)
      .filter((e): e is ProtocolEvent => e !== null)
    return { events, cursor: response.cursor }
  } catch {
    return { code: 'events_unavailable', message: 'Could not load recent activity.' }
  }
}

async function resolveStartLedger(): Promise<number> {
  const latest = await server.getLatestLedger()
  return Math.max(1, latest.sequence - LOOKBACK_LEDGERS)
}

// Raw SEP-41 `transfer` events (mUSDY and SY) are deliberately excluded: the
// moves a user cares about are already narrated by their protocol-level events
// (wrap/unwrap/split/…), and raw transfers would double-report those rows.
const KNOWN_TYPES = new Set<string>([
  'faucet',
  'wrap',
  'unwrap',
  'split',
  'merge',
  'yield_claim',
  'pt_redeem',
  'swap',
  'liquidity_added',
  'liquidity_removed',
])

/**
 * Decode one raw RPC event into a ProtocolEvent, or null if it isn't one of
 * the feed's known event kinds. Exported for unit testing.
 */
export function parseEvent(event: Api.EventResponse): ProtocolEvent | null {
  try {
    const kind = scValToNative(event.topic[0]) as unknown
    if (typeof kind !== 'string' || !KNOWN_TYPES.has(kind)) return null
    const type = kind as ProtocolEventType

    const address =
      event.topic.length > 1 ? (scValToNative(event.topic[1]) as string) : null
    const data = scValToNative(event.value) as Record<string, bigint>

    return {
      id: event.id,
      type,
      address,
      amount: representativeAmount(type, data),
      unit: unitOverride(type, data),
      maturity: typeof data.maturity === 'bigint' ? data.maturity : null,
      ledger: event.ledger,
      txHash: event.txHash,
      closedAt: event.ledgerClosedAt,
    }
  } catch {
    return null
  }
}

/** The single amount most meaningful to show per event type (in stroops). */
function representativeAmount(
  type: ProtocolEventType,
  data: Record<string, bigint | boolean>,
): bigint {
  const num = (v: bigint | boolean | undefined): bigint => (typeof v === 'bigint' ? v : 0n)
  switch (type) {
    case 'split':
      return num(data.sy_in)
    case 'merge':
    case 'yield_claim':
    case 'pt_redeem':
      return num(data.sy_out)
    case 'swap':
      return num(data.amount_out)
    case 'liquidity_added':
      return num(data.sy_in)
    case 'liquidity_removed':
      return num(data.sy_out)
    // The mock vault wraps 1:1 and emits a single `amount`; the Blend vault
    // mints bTokens, so its event carries both legs — show the one the user
    // typed in each direction.
    case 'wrap':
      return num(data.amount ?? data.asset_in)
    case 'unwrap':
      return num(data.amount ?? data.sy_in)
    default:
      return num(data.amount)
  }
}

/**
 * A per-event display unit where the type alone is ambiguous: a swap's output
 * is SY when PT went in, PT when SY went in (`pt_in` flag). Null lets the feed
 * fall back to the type's fixed unit.
 */
function unitOverride(
  type: ProtocolEventType,
  data: Record<string, bigint | boolean>,
): string | null {
  if (type === 'swap') return data.pt_in === true ? 'SY' : 'PT'
  return null
}
