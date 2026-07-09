/** Soroban event polling for the vault's live activity feed (deposit/withdraw). */
import { scValToNative } from '@stellar/stellar-sdk'
import { Api, Server } from '@stellar/stellar-sdk/rpc'
import { config } from '../config'
import type { AppError } from '../types'

const server = new Server(config.sorobanRpcUrl)

/** A parsed deposit or withdraw event published by the vault contract. */
export interface VaultEvent {
  id: string
  type: 'deposit' | 'withdraw'
  address: string
  amount: bigint
  newTotal: bigint
  ledger: number
  txHash: string
  /** ISO timestamp the ledger closed at. */
  closedAt: string
}

export interface FetchVaultEventsResult {
  events: VaultEvent[]
  cursor: string
}

/**
 * Ledgers to look back on the first poll (~2000 ledgers ≈ under 3 hours at
 * ~5s/ledger) — comfortably inside public RPC event retention, and only
 * used to seed the live feed; the funding-pot numbers always come from reads.
 */
const LOOKBACK_LEDGERS = 2000

/**
 * Fetch vault deposit/withdraw events, either from a fresh lookback window
 * (`cursor` omitted) or continuing from a previous `cursor`.
 */
export async function fetchVaultEvents(cursor?: string): Promise<FetchVaultEventsResult | AppError> {
  try {
    const filters: Api.EventFilter[] = [{ type: 'contract', contractIds: [config.vaultContractId] }]
    const request: Api.GetEventsRequest = cursor
      ? { filters, cursor, limit: 50 }
      : { filters, startLedger: await resolveStartLedger(), limit: 50 }

    const response = await server.getEvents(request)
    const events = response.events.map(parseEvent).filter((e): e is VaultEvent => e !== null)
    return { events, cursor: response.cursor }
  } catch {
    return { code: 'events_unavailable', message: 'Could not load recent vault activity.' }
  }
}

async function resolveStartLedger(): Promise<number> {
  const latest = await server.getLatestLedger()
  return Math.max(1, latest.sequence - LOOKBACK_LEDGERS)
}

/** Decode one raw RPC event into a VaultEvent, or null if it isn't a deposit/withdraw event. */
function parseEvent(event: Api.EventResponse): VaultEvent | null {
  try {
    const kind = scValToNative(event.topic[0]) as unknown
    if (kind !== 'deposit' && kind !== 'withdraw') return null
    const address = scValToNative(event.topic[1]) as string
    const data = scValToNative(event.value) as { amount: bigint; new_total: bigint }
    return {
      id: event.id,
      type: kind,
      address,
      amount: data.amount,
      newTotal: data.new_total,
      ledger: event.ledger,
      txHash: event.txHash,
      closedAt: event.ledgerClosedAt,
    }
  } catch {
    return null
  }
}
