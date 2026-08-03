/** Warning shown when the wallet is on a non-Testnet network, or can't report one. */
import type { ReactElement } from 'react'
import { useWallet } from '../context/WalletContext'
import { AlertTriangleIcon } from './icons'

export function NetworkBanner(): ReactElement | null {
  const { isWrongNetwork, networkUnknown, network } = useWallet()
  if (!isWrongNetwork && !networkUnknown) return null

  return (
    <div role="alert" className="border-b border-warning-500/30 bg-warning-500/10">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 text-sm text-warning-100">
        <AlertTriangleIcon className="h-5 w-5 shrink-0 text-warning-400" />
        {isWrongNetwork ? (
          <p>
            <span className="font-semibold">
              Everspan uses Stellar Testnet; your wallet is on {network ?? 'another network'}.
            </span>{' '}
            Switch the active network in your wallet. Financial actions are paused until it matches.
          </p>
        ) : (
          <p>
            <span className="font-semibold">Network unverified.</span> Your wallet didn’t report its
            network — make sure it’s on Stellar Testnet before sending.
          </p>
        )}
      </div>
    </div>
  )
}
