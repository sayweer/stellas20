import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chainNowMs, hasChainTime, noteChainTime } from './chainTime'

describe('chainTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-12T00:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('anchors to the sampled ledger close time (unix-seconds string)', () => {
    const localMs = Date.now()
    // Pretend the chain is 5 minutes ahead of the (wrong) local clock.
    const chainSec = Math.floor(localMs / 1000) + 300
    noteChainTime(String(chainSec))
    expect(hasChainTime()).toBe(true)
    // chainNowMs should reflect the +300s offset (within the same tick).
    expect(Math.round((chainNowMs() - localMs) / 1000)).toBe(300)
  })

  it('ignores a malformed sample', () => {
    const before = chainNowMs()
    noteChainTime('not-a-number')
    expect(chainNowMs()).toBe(before)
  })
})
