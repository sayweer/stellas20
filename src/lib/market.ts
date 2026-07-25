/**
 * The market the app is currently pointed at.
 *
 * Every contract service resolves its address through here rather than through
 * a fixed config field, because a market switch swaps *all* of them at once
 * (each market is an independent deployment: its own SY vault, Market and
 * pool). The selection lives in module state instead of React state so the
 * services stay framework-agnostic; `App` remounts the whole content subtree on
 * a switch, so no hook can ever read a stale market mid-render.
 */
import { markets, type MarketConfig, type MarketKey } from '../config'

let active: MarketConfig = markets[0]

/** The market every contract read/write currently targets. */
export function activeMarket(): MarketConfig {
  return active
}

/** Point the app at another market. Unknown keys are ignored. */
export function setActiveMarket(key: MarketKey): void {
  const next = markets.find((m) => m.key === key)
  if (next) active = next
}
