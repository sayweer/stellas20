import { useState } from 'react'
import type { ReactElement } from 'react'
import { useWallet } from './context/WalletContext'
import { useBalance } from './hooks/useBalance'
import { usePortfolio } from './hooks/usePortfolio'
import { usePools } from './hooks/usePools'
import { useLiveRate } from './hooks/useLiveRate'
import { useProtocolEvents } from './hooks/useProtocolEvents'
import { isContractsConfigured } from './config'
import { Header } from './components/Header'
import { NetworkBanner } from './components/NetworkBanner'
import { BalanceCard } from './components/BalanceCard'
import { RateTicker } from './components/RateTicker'
import { WalletBar } from './components/WalletBar'
import { TabNav, type TabId } from './components/TabNav'
import { MarketsList } from './components/MarketsList'
import { TradePanel } from './components/TradePanel'
import { PoolPanel } from './components/PoolPanel'
import { PortfolioView } from './components/PortfolioView'
import { AdvancedPanel } from './components/AdvancedPanel'
import { ConnectPrompt } from './components/ConnectPrompt'
import { ActivityFeed } from './components/ActivityFeed'
import { Toast } from './components/Toast'
import { AlertTriangleIcon } from './components/icons'

function App(): ReactElement {
  const { isConnected, address, isWrongNetwork } = useWallet()
  const balance = useBalance(address)
  const { portfolio, loading, error, refresh, refreshSilent } = usePortfolio(address)
  const pools = usePools(address, portfolio.maturities)
  const liveRate = useLiveRate(portfolio.rateInfo)
  const configured = isContractsConfigured()

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
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <Header />
      <NetworkBanner />

      {!configured && (
        <div role="alert" className="border-b border-amber-500/30 bg-amber-500/10">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 text-sm text-amber-100">
            <AlertTriangleIcon className="h-5 w-5 shrink-0 text-amber-400" />
            <p>
              Contract IDs are not configured. Set the <code>VITE_*_CONTRACT_ID</code> variables to
              point at a deployment.
            </p>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6 sm:py-8">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">
              Lock a fixed yield on Stellar
            </h1>
            <p className="mt-1 text-sm text-neutral-400">
              stellas-core — split yield into principal &amp; yield tokens, then trade a fixed rate.
              Testnet.
            </p>
          </div>
          <RateTicker rateInfo={portfolio.rateInfo} />
        </div>

        {connected && (
          <WalletBar
            address={address}
            myt={portfolio.myt}
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

        <TabNav active={tab} onChange={setTab} />

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
            />
          ) : (
            <ConnectPrompt message="Connect a Testnet wallet to lock a fixed rate or go long yield." />
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
            />
          ) : (
            <ConnectPrompt message="Connect a Testnet wallet to provide liquidity and earn swap fees." />
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
            <ConnectPrompt message="Connect a Testnet wallet to see your positions and claimable yield." />
          ))}

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
            <ConnectPrompt message="Connect a Testnet wallet to wrap mUSDY and split SY into PT + YT." />
          ))}

        <ActivityFeed events={events} />
      </main>

      <footer className="border-t border-neutral-800/60 py-6">
        <p className="mx-auto max-w-5xl px-4 text-center text-xs text-neutral-400">
          stellas-core · Testnet only · Never share your secret key.
        </p>
      </footer>

      <Toast />
    </div>
  )
}

export default App
