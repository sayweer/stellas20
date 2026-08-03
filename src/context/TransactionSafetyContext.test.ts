import { describe, expect, it } from 'vitest'
import { restoreTrackedTransaction } from './TransactionSafetyContext'

describe('transaction safety restoration', () => {
  it.each(['signing', 'pending'] as const)(
    'restores a %s transaction as uncertain after reload',
    (phase) => {
      const restored = restoreTrackedTransaction(
        JSON.stringify({
          label: 'Lock rate',
          hash: phase === 'pending' ? 'abc123' : null,
          phase,
          error: null,
          state: 'in_flight',
          updatedAt: 42,
        }),
      )

      expect(restored).toMatchObject({
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

  it.each([null, '', '{bad json', JSON.stringify({ label: 'Missing phase' })])(
    'ignores malformed storage safely',
    (raw) => {
      expect(restoreTrackedTransaction(raw)).toBeNull()
    },
  )
})
