import { useState } from 'react'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { useWallet } from './context/WalletContext'
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
import { MarketsList } from './components/MarketsList'
import { TradePanel } from './components/TradePanel'
import { PoolPanel } from './components/PoolPanel'
import { PortfolioView } from './components/PortfolioView'
import { AdvancedPanel } from './components/AdvancedPanel'
import { ConnectPrompt } from './components/ConnectPrompt'
import { ActivityFeed } from './components/ActivityFeed'
import { Toast } from './components/Toast'
import { AlertTriangleIcon, ExternalLinkIcon } from './components/icons'

function App(): ReactElement {
  useSurface('app')
  useDocumentTitle('App — stellas20')
  const [marketKey, setMarketKey] = useState<MarketKey>(markets[0].key)
  const configured = isContractsConfigured()

  function switchMarket(key: MarketKey): void {
    // The contract services resolve addresses from module state, so point them
    // at the new deployment before the remount below refetches everything.
    setActiveMarket(key)
    setMarketKey(key)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <NetworkBanner />

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
      <MarketContent key={marketKey} marketKey={marketKey} onSwitchMarket={switchMarket} />

      <Toast />
    </div>
  )
}

interface MarketContentProps {
  marketKey: MarketKey
  onSwitchMarket: (key: MarketKey) => void
}

/** Everything that belongs to one market. Mounted fresh per market. */
function MarketContent({ marketKey, onSwitchMarket }: MarketContentProps): ReactElement {
  const { isConnected, address, isWrongNetwork } = useWallet()
  const balance = useBalance(address)
  const { portfolio, loading, error, refresh, refreshSilent } = usePortfolio(address)
  const pools = usePools(address, portfolio.maturities)
  const liveRate = useLiveRate(portfolio.rateInfo)

  const [tab, setTab] = useState<TabId>('markets')
  const [tradeMaturity, setTradeMaturity] = useState<bigint | null>(null)
  const [poolMaturity, setPoolMaturity] = useState<bigint | null>(null)

  // A new event (ours or anyone's) may make reads stale — refresh both the
  // portfolio and pool reads in the background (no spinner flash).
  const events = useProtocolEvents(() => {
    refreshSilent()
    pools.refreshSilent()
  })

  function refreshAll(): void {
    refresh()
    pools.refresh()
    balance.refresh()
  }

  function goTrade(maturity: bigint): void {
    setTradeMaturity(maturity)
    setTab('trade')
  }

  function goPool(maturity: bigint): void {
    setPoolMaturity(maturity)
    setTab('pool')
  }

  const connected = isConnected && address !== null

  return (
    <>
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-10 px-4 lg:px-6">
        <aside className="hidden w-52 shrink-0 flex-col py-6 lg:flex">
          <Link
            to="/"
            className="flex items-center gap-2.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60"
          >
            <BrandMark className="h-6 w-6 text-neutral-50" />
            <span className="text-base font-medium tracking-[-0.02em] text-neutral-50">
              stellas20
            </span>
          </Link>

          <div className="mt-8">
            <SideNav active={tab} onChange={setTab} />
          </div>

          <div className="mt-auto space-y-4 pt-8">
            <RateTicker rateInfo={portfolio.rateInfo} />
            <p className="text-[11px] leading-relaxed text-neutral-600">
              Testnet only. Never share your secret key.
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Wraps rather than shrinks: the market switcher and the wallet control
              are both fixed-width, and on a phone they overlapped when forced
              onto one line. Below sm the switcher drops to its own row. */}
          <header className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-b border-neutral-800 bg-neutral-950/90 px-4 py-3 backdrop-blur lg:mx-0 lg:px-0">
            <Link
              to="/"
              aria-label="stellas20 home"
              className="order-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60 lg:hidden"
            >
              <BrandMark className="h-6 w-6 text-neutral-50" />
            </Link>
            <div className="order-2 ml-auto flex items-center gap-2 sm:order-3">
              {config.feedbackFormUrl && (
                <a
                  href={config.feedbackFormUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open feedback form"
                  className="flex h-9 items-center gap-2 rounded-lg border border-neutral-800 px-2.5 text-sm font-medium text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60 sm:px-3"
                >
                  <span className="hidden sm:inline">Feedback</span>
                  <ExternalLinkIcon className="h-4 w-4 shrink-0" />
                </a>
              )}
              <WalletButton />
            </div>
            <div className="order-3 w-full sm:order-2 sm:ml-0 sm:w-auto">
              <MarketSwitcher active={marketKey} onChange={onSwitchMarket} />
            </div>
          </header>

          <main className="flex-1 space-y-6 py-6 sm:py-8">
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
            {connected && !balance.funded && !balance.loading && !balance.error && (
              <BalanceCard
                address={address}
                balance={balance.balance}
                funded={balance.funded}
                loading={balance.loading}
                error={balance.error}
                onRefresh={balance.refresh}
              />
            )}

            {tab === 'markets' && (
              <MarketsList
                pools={pools.pools}
                loading={pools.loading}
                rateInfo={portfolio.rateInfo}
                liveRate={liveRate}
                onTrade={goTrade}
              />
            )}

            {tab === 'trade' &&
              (connected ? (
                <TradePanel
                  address={address}
                  isWrongNetwork={isWrongNetwork}
                  pools={pools.pools}
                  syBalance={portfolio.sy}
                  liveRate={liveRate}
                  initialMaturity={tradeMaturity}
                  onSuccess={refreshAll}
                  onGoAdvanced={() => {
                    setTab('advanced')
                  }}
                />
              ) : (
                <ConnectPrompt tab="trade" message="Connect a Testnet wallet to lock a fixed rate or go long yield." />
              ))}

            {tab === 'pool' &&
              (connected ? (
                <PoolPanel
                  address={address}
                  isWrongNetwork={isWrongNetwork}
                  pools={pools.pools}
                  positions={portfolio.positions}
                  syBalance={portfolio.sy}
                  initialMaturity={poolMaturity}
                  onSuccess={refreshAll}
                  onGoAdvanced={() => {
                    setTab('advanced')
                  }}
                />
              ) : (
                <ConnectPrompt tab="pool" message="Connect a Testnet wallet to provide liquidity and earn swap fees." />
              ))}

            {tab === 'portfolio' &&
              (connected ? (
                <PortfolioView
                  address={address}
                  portfolio={portfolio}
                  pools={pools.pools}
                  loading={loading}
                  error={error}
                  liveRate={liveRate}
                  isWrongNetwork={isWrongNetwork}
                  onRefresh={refreshAll}
                  onManagePool={goPool}
                />
              ) : (
                <ConnectPrompt tab="portfolio" message="Connect a Testnet wallet to see your positions and claimable yield." />
              ))}

            {tab === 'activity' && <ActivityFeed events={events} />}

            {tab === 'advanced' &&
              (connected ? (
                <AdvancedPanel
                  address={address}
                  portfolio={portfolio}
                  liveRate={liveRate}
                  loading={loading}
                  isWrongNetwork={isWrongNetwork}
                  onSuccess={refreshAll}
                />
              ) : (
                <ConnectPrompt tab="advanced" message="Connect a Testnet wallet to wrap the underlying and split SY into PT + YT." />
              ))}
          </main>
        </div>
      </div>

      <BottomNav active={tab} onChange={setTab} />
    </>
  )
}

export default App
