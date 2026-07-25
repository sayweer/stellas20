import { afterEach, describe, expect, it } from 'vitest'
import { markets } from '../config'
import { activeMarket, setActiveMarket } from './market'

afterEach(() => {
  setActiveMarket(markets[0].key)
})

describe('activeMarket', () => {
  it('starts on the default market', () => {
    expect(activeMarket().key).toBe(markets[0].key)
  })

  it('switches every contract address at once', () => {
    const before = activeMarket()
    const other = markets.find((m) => m.key !== before.key)
    // Only meaningful when a second market is configured.
    if (!other) return

    setActiveMarket(other.key)
    const after = activeMarket()

    expect(after.key).toBe(other.key)
    // A market is a whole deployment: no address may leak across a switch.
    expect(after.syVaultContractId).not.toBe(before.syVaultContractId)
    expect(after.splitterContractId).not.toBe(before.splitterContractId)
    expect(after.ammContractId).not.toBe(before.ammContractId)
    expect(after.underlyingContractId).not.toBe(before.underlyingContractId)
  })

  it('ignores an unknown key rather than pointing at nothing', () => {
    const before = activeMarket()
    setActiveMarket('nope' as (typeof markets)[number]['key'])
    expect(activeMarket()).toBe(before)
  })
})
