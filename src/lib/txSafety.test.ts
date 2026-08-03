import { describe, expect, it } from 'vitest'
import {
  isResolvedLocalUncertainty,
  isUncertainSubmission,
  isWriteBlocked,
} from './txSafety'

describe('uncertain transaction safety', () => {
  it('blocks another write after submission produced a hash', () => {
    expect(
      isUncertainSubmission({ status: 'error', phase: 'pending', hash: 'abc123' }),
    ).toBe(true)
  })

  it('blocks another write when submission began without returning a hash', () => {
    expect(isUncertainSubmission({ status: 'error', phase: 'pending', hash: null })).toBe(true)
  })

  it('blocks retry after the opaque wallet send starts, even without a callback', () => {
    expect(isUncertainSubmission({ status: 'error', phase: 'signing', hash: null })).toBe(true)
  })

  it('allows retry when building failed before the wallet opened', () => {
    expect(isUncertainSubmission({ status: 'error', phase: 'building', hash: null })).toBe(false)
  })

  it('does not classify confirmed outcomes as uncertain', () => {
    expect(isUncertainSubmission({ status: 'success', hash: 'abc123' })).toBe(false)
  })

  it('hides a stale local uncertainty after the global safety record is cleared', () => {
    const outcome = { status: 'error', phase: 'pending' as const, hash: 'abc123' }
    expect(isResolvedLocalUncertainty(outcome, true)).toBe(false)
    expect(isResolvedLocalUncertainty(outcome, false)).toBe(true)
  })

  it('uses connectivity and the global record as the write lock', () => {
    expect(isWriteBlocked(true, false)).toBe(false)
    expect(isWriteBlocked(false, false)).toBe(true)
    expect(isWriteBlocked(true, true)).toBe(true)
    expect(isWriteBlocked(true, false, false)).toBe(true)
  })
})
