/** Placeholder shown in a connection-gated tab while the wallet is disconnected. */
import type { ReactElement } from 'react'
import { WalletIcon } from './icons'

export function ConnectPrompt({ message }: { message: string }): ReactElement {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
        <WalletIcon className="h-7 w-7" />
      </div>
      <h2 className="mt-5 text-lg font-semibold tracking-tight text-neutral-50">Connect to start</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-neutral-400">{message}</p>
    </div>
  )
}
