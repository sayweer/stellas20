import { describe, expect, it } from 'vitest'
import { ownsTrackedTransaction, restoreTrackedTransaction } from './TransactionSafetyContext'

describe('transaction safety restoration', () => {
  it.each(['signing', 'pending'] as const)(
    'restores a %s transaction as uncertain after reload',
    (phase) => {
      const restored = restoreTrackedTransaction(
        JSON.stringify({
          version: 2,
          id: 'transaction-a',
          label: 'Lock rate',
          hash: phase === 'pending' ? 'abc123' : null,
          phase,
          error: null,
          state: 'in_flight',
          updatedAt: 42,
        }),
      )

      expect(restored).toMatchObject({
        id: 'transaction-a',
        label: 'Lock rate',
        phase,
        state: 'uncertain',
        updatedAt: 42,
      })
    },
  )

  it('releases a build-only record because the wallet was never asked to sign', () => {
    expect(
      restoreTrackedTransaction(
        JSON.stringify({
          version: 2,
          id: 'transaction-a',
          label: 'Lock rate',
          hash: null,
          phase: 'building',
          error: null,
          state: 'in_flight',
          updatedAt: 42,
        }),
      ),
    ).toBeNull()
  })

  it('keeps a building record fail-closed when it contains submission evidence', () => {
    expect(
      restoreTrackedTransaction(
        JSON.stringify({
          version: 2,
          id: 'transaction-a',
          label: 'Lock rate',
          hash: 'abc123',
          phase: 'building',
          state: 'in_flight',
          updatedAt: 42,
        }),
      ),
    ).toMatchObject({ id: 'transaction-a', hash: 'abc123', state: 'uncertain' })
  })

  it('keeps another tab\'s fresh owner lease in flight', () => {
    const raw = JSON.stringify({
      version: 2,
      id: 'transaction-a',
      ownerId: 'tab-a',
      label: 'Split',
      hash: null,
      phase: 'signing',
      state: 'in_flight',
      updatedAt: 1_000,
    })
    expect(restoreTrackedTransaction(raw, 2_000)).toMatchObject({
      ownerId: 'tab-a',
      state: 'in_flight',
    })
    expect(restoreTrackedTransaction(raw, 200_000)).toMatchObject({
      ownerId: 'tab-a',
      state: 'uncertain',
    })
  })

  it('allows only the exact owner to mutate or clear a record', () => {
    const current = restoreTrackedTransaction(
      JSON.stringify({
        version: 2,
        id: 'transaction-b',
        label: 'Sell PT',
        hash: 'def456',
        phase: 'pending',
        state: 'in_flight',
        updatedAt: 43,
      }),
    )
    expect(ownsTrackedTransaction(current, 'transaction-b')).toBe(true)
    expect(ownsTrackedTransaction(current, 'transaction-a')).toBe(false)
    expect(ownsTrackedTransaction(null, 'transaction-b')).toBe(false)
  })

  it.each([null, '', '{bad json', JSON.stringify({ label: 'Missing phase' })])(
    'ignores malformed storage safely',
    (raw) => {
      expect(restoreTrackedTransaction(raw)).toBeNull()
    },
  )
})
