import type { ReactElement } from 'react'
import { useWallet } from './context/WalletContext'
import { useBalance } from './hooks/useBalance'
import { Header } from './components/Header'
import { NetworkBanner } from './components/NetworkBanner'
import { BalanceCard } from './components/BalanceCard'
import { PaymentForm } from './components/PaymentForm'
import { Toast } from './components/Toast'
import { WalletIcon } from './components/icons'

function App(): ReactElement {
  const { isConnected, address } = useWallet()
  const balance = useBalance(address)
  const availableBalance = balance.balance !== null ? Number(balance.balance) : null

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <NetworkBanner />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:py-12">
        {isConnected && address ? (
          <div className="space-y-6">
            <BalanceCard
              address={address}
              balance={balance.balance}
              funded={balance.funded}
              loading={balance.loading}
              error={balance.error}
              onRefresh={balance.refresh}
            />
            {balance.funded && (
              <PaymentForm availableBalance={availableBalance} onSuccess={balance.refresh} />
            )}
          </div>
        ) : (
          <div className="mx-auto mt-6 max-w-md text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
              <WalletIcon className="h-7 w-7" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-neutral-50">
              Send XLM on Testnet
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">
              Connect your Freighter wallet to view your balance and send a Stellar Testnet payment.
            </p>
          </div>
        )}
      </main>

      <footer className="border-t border-neutral-800/60 py-6">
        <p className="mx-auto max-w-2xl px-4 text-center text-xs text-neutral-600">
          Stellar White Belt · Testnet only · Never share your secret key.
        </p>
      </footer>

      <Toast />
    </div>
  )
}

export default App
