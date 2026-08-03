const STORAGE_KEY = 'everspan:long-yield-progress:v1'
const VERSION = 1 as const

export interface LongYieldProgress {
  version: typeof VERSION
  id: string
  address: string
  marketKey: string
  maturity: string
  ptOut: string
  syIn: string
  source: 'split' | 'existing'
  updatedAt: number
}

export type LongYieldRecovery =
  | { kind: 'resume_saved'; ptOut: bigint; syIn: bigint }
  | { kind: 'choose_existing' }
  | { kind: 'new_split' }

type ProgressStore = Record<string, LongYieldProgress>

function scopeKey(address: string, marketKey: string, maturity: bigint | string): string {
  return `${address.toLowerCase()}:${marketKey}:${maturity.toString()}`
}

function validProgress(value: unknown): value is LongYieldProgress {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<LongYieldProgress>
  return (
    item.version === VERSION &&
    typeof item.id === 'string' &&
    typeof item.address === 'string' &&
    typeof item.marketKey === 'string' &&
    typeof item.maturity === 'string' &&
    /^\d+$/.test(item.maturity) &&
    typeof item.ptOut === 'string' &&
    /^\d+$/.test(item.ptOut) &&
    typeof item.syIn === 'string' &&
    /^\d+$/.test(item.syIn) &&
    (item.source === 'split' || item.source === 'existing') &&
    typeof item.updatedAt === 'number'
  )
}

/** Parse only valid records; malformed entries cannot become sell amounts. */
export function parseLongYieldProgressStore(raw: string | null): ProgressStore {
  try {
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, LongYieldProgress] =>
        validProgress(entry[1]),
      ),
    )
  } catch {
    return {}
  }
}

/**
 * Fail closed when chain holdings and the saved continuation disagree. A
 * persisted exact output may be resumed; any other existing PT requires an
 * explicit user choice before a new split can be created.
 */
export function resolveLongYieldRecovery(
  progress: LongYieldProgress | null,
  existingPtBalance: bigint,
): LongYieldRecovery {
  if (progress) {
    const ptOut = BigInt(progress.ptOut)
    if (ptOut > 0n && ptOut <= existingPtBalance) {
      return { kind: 'resume_saved', ptOut, syIn: BigInt(progress.syIn) }
    }
  }
  if (existingPtBalance > 0n) return { kind: 'choose_existing' }
  return { kind: 'new_split' }
}

function readStore(): ProgressStore {
  return parseLongYieldProgressStore(window.localStorage.getItem(STORAGE_KEY))
}

export function readLongYieldProgress(
  address: string,
  marketKey: string,
  maturity: bigint,
): LongYieldProgress | null {
  try {
    return readStore()[scopeKey(address, marketKey, maturity)] ?? null
  } catch {
    return null
  }
}

export function saveLongYieldProgress(input: {
  address: string
  marketKey: string
  maturity: bigint
  ptOut: bigint
  syIn: bigint
  source: LongYieldProgress['source']
}): boolean {
  try {
    const store = readStore()
    const progress: LongYieldProgress = {
      version: VERSION,
      id: newProgressId(),
      address: input.address,
      marketKey: input.marketKey,
      maturity: input.maturity.toString(),
      ptOut: input.ptOut.toString(),
      syIn: input.syIn.toString(),
      source: input.source,
      updatedAt: Date.now(),
    }
    store[scopeKey(input.address, input.marketKey, input.maturity)] = progress
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    return true
  } catch {
    return false
  }
}

export function clearLongYieldProgress(address: string, marketKey: string, maturity: bigint): void {
  try {
    const store = readStore()
    const target = scopeKey(address, marketKey, maturity)
    const remaining = Object.fromEntries(Object.entries(store).filter(([key]) => key !== target))
    if (Object.keys(remaining).length === 0) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining))
  } catch {
    // Existing PT detection still provides a fail-closed recovery choice.
  }
}

function newProgressId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}:${Math.random().toString(36).slice(2)}`
  }
}
