/** Placeholder shown in a connection-gated tab while the wallet is disconnected. */
import type { ReactElement } from 'react'
import { WalletIcon } from './icons'

interface ConnectPromptProps {
  message: string
  /**
   * The tab this stands in for. It has to carry the panel's identity: while
   * disconnected this *is* the panel, and without it the selected tab's
   * `aria-controls` points at an element that does not exist.
   */
  tab: string
}

export function ConnectPrompt({ message, tab }: ConnectPromptProps): ReactElement {
  return (
    <section
      id={`panel-${tab}`}
      role="tabpanel"
      aria-labelledby={`tab-${tab}`}
      className="rounded-2xl border border-neutral-800 bg-neutral-900 p-10 text-center"
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-850 text-neutral-400">
        <WalletIcon className="h-6 w-6" />
      </div>
      <h2 className="mt-5 text-lg font-medium tracking-[-0.02em] text-neutral-50">
        Connect to start
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-neutral-400">{message}</p>
    </section>
  )
}
