import type { ReactElement } from 'react'
import { useWallet } from './context/WalletContext'
import { useBalance } from './hooks/useBalance'
import { useVaultState } from './hooks/useVaultState'
import { useVaultEvents } from './hooks/useVaultEvents'
import { stroopsToXlm } from './lib/amounts'
import { Header } from './components/Header'
import { NetworkBanner } from './components/NetworkBanner'
import { BalanceCard } from './components/BalanceCard'
import { FundingPot } from './components/FundingPot'
import { VaultActions } from './components/VaultActions'
import { ActivityFeed } from './components/ActivityFeed'
import { Toast } from './components/Toast'
import { WalletIcon } from './components/icons'

function App(): ReactElement {
  const { isConnected, address, isWrongNetwork } = useWallet()
  const balance = useBalance(address)
  const vault = useVaultState(address)
  const walletBalanceXlm = balance.balance !== null ? Number(balance.balance) : null
  const vaultBalanceXlm = vault.state ? Number(stroopsToXlm(vault.state.myBalance)) : 0

  // New events (ours or anyone else's) mean the funding-pot totals may be
  // stale — refresh from a read rather than trust the event payload alone.
  const events = useVaultEvents(vault.refresh)

  function refreshAll(): void {
    vault.refresh()
    balance.refresh()
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <NetworkBanner />

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8 sm:py-12">
        <FundingPot state={vault.state} loading={vault.loading} error={vault.error} onRefresh={vault.refresh} />

        {isConnected && address && balance.funded ? (
          <>
            <BalanceCard
              address={address}
              balance={balance.balance}
              funded={balance.funded}
              loading={balance.loading}
              error={balance.error}
              onRefresh={balance.refresh}
            />
            <VaultActions
              address={address}
              walletBalanceXlm={walletBalanceXlm}
              vaultBalanceXlm={vaultBalanceXlm}
              isWrongNetwork={isWrongNetwork}
              onSuccess={refreshAll}
            />
          </>
        ) : isConnected && address ? (
          <BalanceCard
            address={address}
            balance={balance.balance}
            funded={balance.funded}
            loading={balance.loading}
            error={balance.error}
            onRefresh={balance.refresh}
          />
        ) : (
          <div className="mx-auto mt-6 max-w-md text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
              <WalletIcon className="h-7 w-7" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-neutral-50">
              Contribute to the pot
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">
              Connect a Testnet wallet to deposit or withdraw XLM in the vault above.
            </p>
          </div>
        )}

        <ActivityFeed events={events} />
      </main>

      <footer className="border-t border-neutral-800/60 py-6">
        <p className="mx-auto max-w-2xl px-4 text-center text-xs text-neutral-600">
          stellas-vault · Yellow Belt · Testnet only · Never share your secret key.
        </p>
      </footer>

      <Toast />
    </div>
  )
}

export default App
