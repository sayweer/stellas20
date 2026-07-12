import type { ReactElement } from 'react'
import { useWallet } from './context/WalletContext'
import { useBalance } from './hooks/useBalance'
import { usePortfolio } from './hooks/usePortfolio'
import { useLiveRate } from './hooks/useLiveRate'
import { useProtocolEvents } from './hooks/useProtocolEvents'
import { isContractsConfigured } from './config'
import { Header } from './components/Header'
import { NetworkBanner } from './components/NetworkBanner'
import { BalanceCard } from './components/BalanceCard'
import { RateTicker } from './components/RateTicker'
import { PortfolioPanel } from './components/PortfolioPanel'
import { WrapCard } from './components/WrapCard'
import { SplitCard } from './components/SplitCard'
import { MaturityPanel } from './components/MaturityPanel'
import { ActivityFeed } from './components/ActivityFeed'
import { Toast } from './components/Toast'
import { AlertTriangleIcon, WalletIcon } from './components/icons'

function App(): ReactElement {
  const { isConnected, address, isWrongNetwork } = useWallet()
  const balance = useBalance(address)
  const { portfolio, loading, error, refresh, refreshSilent } = usePortfolio(address)
  const liveRate = useLiveRate(portfolio.rateInfo)
  const configured = isContractsConfigured()

  function refreshAll(): void {
    refresh()
    balance.refresh()
  }

  // A new event (ours or anyone's) may make reads stale — refresh in the
  // background (no spinner flash) from chain.
  const events = useProtocolEvents(refreshSilent)

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <NetworkBanner />

      {!configured && (
        <div role="alert" className="border-b border-amber-500/30 bg-amber-500/10">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 text-sm text-amber-100">
            <AlertTriangleIcon className="h-5 w-5 shrink-0 text-amber-400" />
            <p>
              Contract IDs are not configured. Set <code>VITE_MYT_CONTRACT_ID</code>,{' '}
              <code>VITE_SY_VAULT_CONTRACT_ID</code>, and <code>VITE_SPLITTER_CONTRACT_ID</code>.
            </p>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6 sm:py-10">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">
              Split any yield into principal &amp; yield tokens
            </h1>
            <p className="mt-1 text-sm text-neutral-400">
              stellas-core v0 — the missing PT/YT primitive for Stellar’s RWA yield, on Testnet.
            </p>
          </div>
          <RateTicker rateInfo={portfolio.rateInfo} />
        </div>

        <PortfolioPanel
          address={address}
          portfolio={portfolio}
          loading={loading}
          error={error}
          liveRate={liveRate}
          isWrongNetwork={isWrongNetwork}
          onRefresh={refresh}
        />

        {isConnected && address ? (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <WrapCard
                address={address}
                mytBalance={portfolio.myt}
                syBalance={portfolio.sy}
                loading={loading}
                isWrongNetwork={isWrongNetwork}
                onSuccess={refreshAll}
              />
              <SplitCard
                address={address}
                syBalance={portfolio.sy}
                positions={portfolio.positions}
                liveRate={liveRate}
                loading={loading}
                isWrongNetwork={isWrongNetwork}
                onSuccess={refreshAll}
              />
            </div>

            <MaturityPanel
              address={address}
              positions={portfolio.positions}
              liveRate={liveRate}
              isWrongNetwork={isWrongNetwork}
              onSuccess={refreshAll}
            />

            <BalanceCard
              address={address}
              balance={balance.balance}
              funded={balance.funded}
              loading={balance.loading}
              error={balance.error}
              onRefresh={balance.refresh}
            />
          </>
        ) : (
          <div className="mx-auto mt-2 max-w-md text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
              <WalletIcon className="h-7 w-7" />
            </div>
            <h2 className="mt-5 text-lg font-semibold tracking-tight text-neutral-50">
              Connect to start
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">
              Connect a Testnet wallet to faucet mUSDY, wrap it into SY, and split it into tradable
              principal and yield.
            </p>
          </div>
        )}

        <ActivityFeed events={events} />
      </main>

      <footer className="border-t border-neutral-800/60 py-6">
        <p className="mx-auto max-w-5xl px-4 text-center text-xs text-neutral-600">
          stellas-core · Orange Belt · Testnet only · Never share your secret key.
        </p>
      </footer>

      <Toast />
    </div>
  )
}

export default App
