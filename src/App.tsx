import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useWallet } from './context/WalletContext'
import { useTransactionSafety } from './context/TransactionSafetyContext'
import { useSurface } from './hooks/useSurface'
import { useDocumentTitle } from './hooks/useDocumentTitle'
import { useBalance } from './hooks/useBalance'
import { usePortfolio } from './hooks/usePortfolio'
import { usePools } from './hooks/usePools'
import { useLiveRate } from './hooks/useLiveRate'
import { useProtocolEvents } from './hooks/useProtocolEvents'
import { config, isContractsConfigured, markets, type MarketKey } from './config'
import { setActiveMarket } from './lib/market'
import { NetworkBanner } from './components/NetworkBanner'
import { BalanceCard } from './components/BalanceCard'
import { RateTicker } from './components/RateTicker'
import { WalletBar } from './components/WalletBar'
import { WalletButton } from './components/WalletButton'
import { BrandMark } from './components/BrandMark'
import { MarketSwitcher } from './components/MarketSwitcher'
import { BottomNav, SideNav, type TabId } from './components/SideNav'
import { PortfolioView } from './components/PortfolioView'
import { ConnectPrompt } from './components/ConnectPrompt'
import { ThemeToggle } from './components/ThemeToggle'
import { OverviewPanel, type EarnStrategy } from './components/OverviewPanel'
import { EarnPanel } from './components/EarnPanel'
import { MorePanel, type MoreView } from './components/MorePanel'
import { ConnectionBanner } from './components/ConnectionBanner'
import { AlertTriangleIcon } from './components/icons'
import { DataUnavailable } from './components/DataUnavailable'

function App(): ReactElement {
  useSurface('app')
  useDocumentTitle('App — Everspan')
  const [marketKey, setMarketKey] = useState<MarketKey>(markets[0].key)
  const { address } = useWallet()
  const { resolutionVersion, dataVersion, trackedTransaction } = useTransactionSafety()
  const configured = isContractsConfigured()
  const mountedScope = useRef(false)

  useEffect(() => {
    if (!mountedScope.current) {
      mountedScope.current = true
      return
    }
    focusActivePanel()
  }, [address, resolutionVersion])

  function switchMarket(key: MarketKey): void {
    if (trackedTransaction?.state === 'in_flight') return
    // The contract services resolve addresses from module state, so point them
    // at the new deployment before the remount below refetches everything.
    setActiveMarket(key)
    setMarketKey(key)
    window.requestAnimationFrame(() => {
      document.getElementById(`market-${key}`)?.focus()
    })
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Same escape hatch the marketing route offers: the rail, the market
          switcher and the wallet control sit ahead of the panel in tab order. */}
      <a
        href="#app-main"
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-full bg-accent-500 px-4 py-3 text-sm font-medium text-onAccent transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-accent-300 focus:ring-offset-2 focus:ring-offset-neutral-950 motion-reduce:transition-none"
      >
        Skip to main content
      </a>
      <NetworkBanner />
      <ConnectionBanner />
      <span role="status" aria-live="polite" className="sr-only">
        {address
          ? `Wallet connected to ${marketKey}. Account ${address.slice(0, 4)}…${address.slice(-4)}.`
          : 'Wallet disconnected.'}
      </span>

      {!configured && (
        <div role="alert" className="border-b border-warning-500/30 bg-warning-500/10">
          <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 text-sm text-warning-100 lg:px-6">
            <AlertTriangleIcon className="h-5 w-5 shrink-0 text-warning-400" />
            <p>
              Contract IDs are not configured. Set the <code>VITE_*_CONTRACT_ID</code> variables to
              point at a deployment.
            </p>
          </div>
        </div>
      )}

      {/* Each market is an independent deployment — its own vault, Market,
          pools and balances. Remounting on a switch is what guarantees that
          no read, position or form value survives from the previous one. */}
      <MarketContent
        key={`${marketKey}:${address ?? 'disconnected'}:${resolutionVersion}`}
        marketKey={marketKey}
        dataVersion={dataVersion}
        onSwitchMarket={switchMarket}
      />
    </div>
  )
}

interface MarketContentProps {
  marketKey: MarketKey
  dataVersion: number
  onSwitchMarket: (key: MarketKey) => void
}

/** Everything that belongs to one market. Mounted fresh per market. */
function MarketContent({
  marketKey,
  dataVersion,
  onSwitchMarket,
}: MarketContentProps): ReactElement {
  const { isConnected, address, isWrongNetwork } = useWallet()
  const balance = useBalance(address)
  const { portfolio, loading, error, refresh, refreshSilent } = usePortfolio(address)
  const pools = usePools(address, portfolio.maturities)
  const liveRate = useLiveRate(portfolio.rateInfo)
  const refreshPools = pools.refresh
  const refreshBalance = balance.refresh
  const seenDataVersion = useRef(dataVersion)

  useEffect(() => {
    if (seenDataVersion.current === dataVersion) return
    seenDataVersion.current = dataVersion
    refresh()
    refreshPools()
    refreshBalance()
  }, [dataVersion, refresh, refreshBalance, refreshPools])

  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('view')
  const tab: TabId =
    requestedTab === 'earn' ||
    requestedTab === 'portfolio' ||
    requestedTab === 'more' ||
    requestedTab === 'overview'
      ? requestedTab
      : 'overview'
  const requestedStrategy = searchParams.get('strategy')
  const strategy: EarnStrategy =
    requestedStrategy === 'yield' || requestedStrategy === 'liquidity' ? requestedStrategy : 'fixed'
  const moreView: MoreView = searchParams.get('tool') === 'activity' ? 'activity' : 'convert'
  const maturity = parseMaturity(searchParams.get('maturity'))

  // A primary destination should start at its heading even when it is chosen
  // from the pinned mobile navigation after scrolling another long panel.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [tab])

  // A new event (ours or anyone's) may make reads stale — refresh both the
  // portfolio and pool reads in the background (no spinner flash).
  const activity = useProtocolEvents(() => {
    refreshSilent()
    pools.refreshSilent()
  })
  const personalActivity = useProtocolEvents(
    undefined,
    isConnected && address !== null ? address : null,
  )
  const dataError = error ?? pools.error

  function refreshAll(): void {
    refresh()
    pools.refresh()
    balance.refresh()
  }

  function updateLocation(next: {
    tab?: TabId
    strategy?: EarnStrategy
    tool?: MoreView
    maturity?: bigint
  }): void {
    const params = new URLSearchParams(searchParams)
    if (next.tab) params.set('view', next.tab)
    if (next.strategy) params.set('strategy', next.strategy)
    if (next.tool) params.set('tool', next.tool)
    if (next.maturity !== undefined) params.set('maturity', next.maturity.toString())
    setSearchParams(params)
  }

  function setTab(next: TabId): void {
    updateLocation({ tab: next })
  }

  function chooseStrategy(next: EarnStrategy, maturity?: bigint): void {
    updateLocation({ tab: 'earn', strategy: next, maturity })
  }

  function openStrategy(next: EarnStrategy, maturity?: bigint): void {
    chooseStrategy(next, maturity)
    focusPanel('earn')
  }

  function goPool(maturity: bigint): void {
    updateLocation({ tab: 'earn', strategy: 'liquidity', maturity })
    focusPanel('earn')
  }

  function goConvert(): void {
    updateLocation({ tab: 'more', tool: 'convert' })
    focusPanel('more')
  }

  function goPortfolio(): void {
    updateLocation({ tab: 'portfolio' })
    focusPanel('portfolio')
  }

  const connected = isConnected && address !== null

  return (
    <>
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-10 px-4 lg:px-6">
        <aside className="hidden w-52 shrink-0 flex-col py-6 lg:flex">
          <Link
            to="/"
            className="flex min-h-11 items-center gap-2.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
          >
            <BrandMark className="h-6 w-6 text-neutral-50" />
            <span className="text-base font-medium tracking-[-0.02em] text-neutral-50">
              Everspan
            </span>
          </Link>

          <div className="mt-8">
            <SideNav active={tab} onChange={setTab} />
          </div>

          <div className="mt-auto space-y-4 pt-8">
            <RateTicker rateInfo={portfolio.rateInfo} />
            {config.feedbackFormUrl && (
              <a
                href={config.feedbackFormUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-boundary bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-raised hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
              >
                Share feedback
              </a>
            )}
            <p className="text-[11px] leading-relaxed text-neutral-600">
              Testnet only. Never share your secret key.
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Wraps rather than shrinks: the market switcher and the wallet control
              are both fixed-width, and on a phone they overlapped when forced
              onto one line. Below sm the switcher drops to its own row. */}
          <header className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-b border-hairline bg-neutral-950/90 px-4 py-3 backdrop-blur lg:mx-0 lg:px-0">
            <Link
              to="/"
              aria-label="Everspan home"
              className="order-1 -ml-2 grid h-11 w-11 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 lg:hidden"
            >
              <BrandMark className="h-6 w-6 text-neutral-50" />
            </Link>
            <div className="order-2 ml-auto flex max-w-full flex-wrap items-center justify-end gap-2 sm:order-3">
              {/* The sidebar owns this link on desktop; the compact header is
                  the stable, non-overlapping home for it below lg. */}
              {config.feedbackFormUrl && (
                <a
                  href={config.feedbackFormUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${connected ? 'hidden sm:inline-flex' : 'inline-flex'} min-h-11 items-center whitespace-nowrap rounded-full border border-boundary bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-400 transition-colors hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 lg:hidden`}
                >
                  Feedback
                </a>
              )}
              <ThemeToggle />
              <WalletButton />
            </div>
            <div className="order-3 w-full sm:order-2 sm:ml-0 sm:w-auto">
              <MarketSwitcher active={marketKey} onChange={onSwitchMarket} />
            </div>
          </header>

          <main id="app-main" tabIndex={-1} className="flex-1 space-y-6 py-6 sm:py-8">
            {connected && (
              <WalletBar
                address={address}
                underlying={portfolio.underlying}
                sy={portfolio.sy}
                loading={loading}
                isWrongNetwork={isWrongNetwork}
                onRefresh={refreshAll}
              />
            )}

            {/* An unfunded account can't pay tx fees — surface funding prominently. */}
            {connected && !balance.funded && !balance.loading && (
              <BalanceCard
                address={address}
                balance={balance.balance}
                funded={balance.funded}
                loading={balance.loading}
                error={balance.error}
                onRefresh={balance.refresh}
              />
            )}

            {tab === 'overview' && (
              <OverviewPanel
                connected={connected}
                underlying={portfolio.underlying}
                sy={portfolio.sy}
                positions={portfolio.positions}
                loading={pools.loading || loading}
                pools={pools.pools}
                rateInfo={portfolio.rateInfo}
                liveRate={liveRate}
                error={dataError}
                onRetry={refreshAll}
                onEarn={openStrategy}
                onConvert={goConvert}
                onPortfolio={goPortfolio}
              />
            )}

            {tab === 'earn' &&
              (connected && dataError ? (
                <DataUnavailable error={dataError} onRetry={refreshAll} tab="earn" />
              ) : connected ? (
                <EarnPanel
                  strategy={strategy}
                  onStrategyChange={(next) => chooseStrategy(next)}
                  address={address}
                  isWrongNetwork={isWrongNetwork}
                  pools={pools.pools}
                  poolsLoading={pools.loading || loading}
                  positions={portfolio.positions}
                  syBalance={portfolio.sy}
                  liveRate={liveRate}
                  tradeMaturity={maturity}
                  poolMaturity={maturity}
                  onMaturityChange={(next) => updateLocation({ maturity: next })}
                  onSuccess={refreshAll}
                  onConvert={goConvert}
                />
              ) : (
                <ConnectPrompt
                  tab="earn"
                  message="Connect a Testnet wallet to lock a fixed return, hold yield exposure, or earn trading fees."
                />
              ))}

            {tab === 'portfolio' &&
              (connected ? (
                <PortfolioView
                  address={address}
                  portfolio={portfolio}
                  pools={pools.pools}
                  loading={loading || pools.loading}
                  error={dataError}
                  liveRate={liveRate}
                  isWrongNetwork={isWrongNetwork}
                  onRefresh={refreshAll}
                  onManagePool={goPool}
                  events={personalActivity.events}
                  activityLoading={personalActivity.loading}
                  activityError={personalActivity.error}
                  onRetryActivity={personalActivity.retry}
                />
              ) : (
                <ConnectPrompt
                  tab="portfolio"
                  message="Connect a Testnet wallet to see your positions and claimable yield."
                />
              ))}

            {tab === 'more' && (
              <MorePanel
                view={moreView}
                onViewChange={(next) => updateLocation({ tab: 'more', tool: next })}
                address={connected ? address : null}
                portfolio={portfolio}
                liveRate={liveRate}
                loading={loading}
                isWrongNetwork={isWrongNetwork}
                onSuccess={refreshAll}
                events={activity.events}
                activityLoading={activity.loading}
                activityError={activity.error}
                onRetryActivity={activity.retry}
                dataError={dataError}
                onRetryData={refreshAll}
              />
            )}
          </main>
        </div>
      </div>

      <BottomNav active={tab} onChange={setTab} />
    </>
  )
}

export default App

function parseMaturity(value: string | null): bigint | null {
  if (!value || !/^\d+$/.test(value)) return null
  try {
    return BigInt(value)
  } catch {
    return null
  }
}

function focusPanel(tab: TabId): void {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`#panel-${tab} [data-panel-heading]`)
        ?.focus({ preventScroll: true })
    })
  })
}

function focusActivePanel(): void {
  window.requestAnimationFrame(() => {
    document
      .querySelector<HTMLElement>('[role="tabpanel"] [data-panel-heading]')
      ?.focus({ preventScroll: true })
  })
}
