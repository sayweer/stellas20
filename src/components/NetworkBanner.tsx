/** Prominent warning shown when the wallet is connected to a non-Testnet network. */
import type { ReactElement } from 'react'
import { useWallet } from '../context/WalletContext'
import { AlertTriangleIcon } from './icons'

export function NetworkBanner(): ReactElement | null {
  const { isWrongNetwork, network } = useWallet()
  if (!isWrongNetwork) return null

  return (
    <div role="alert" className="border-b border-amber-500/30 bg-amber-500/10">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3 text-sm text-amber-100">
        <AlertTriangleIcon className="h-5 w-5 shrink-0 text-amber-400" />
        <p>
          <span className="font-semibold">
            Wrong network{network ? ` (${network})` : ''}.
          </span>{' '}
          Switch Freighter to Testnet to continue.
        </p>
      </div>
    </div>
  )
}
