/** Placeholder shown in a connection-gated tab while the wallet is disconnected. */
import type { ReactElement } from 'react'
import { WalletIcon } from './icons'
import { IconTile } from './IconTile'
import { FIGURE_TONE } from '../lib/figures'
import { WalletButton } from './WalletButton'

interface ConnectPromptProps {
  message: string
  /**
   * The tab this stands in for. It has to carry the panel's identity: while
   * disconnected this *is* the panel, and without it the selected tab's
   * `aria-controls` points at an element that does not exist.
   */
  tab: string
  /** Omit tabpanel semantics when the prompt sits inside an existing panel. */
  embedded?: boolean
}

export function ConnectPrompt({
  message,
  tab,
  embedded = false,
}: ConnectPromptProps): ReactElement {
  return (
    <section
      id={embedded ? undefined : `panel-${tab}`}
      role={embedded ? undefined : 'tabpanel'}
      aria-labelledby={embedded ? undefined : `tab-${tab}`}
      className="rounded-2xl border border-hairline bg-neutral-900 p-10 text-center"
    >
      <IconTile tone={FIGURE_TONE.balance} size="lg" className="mx-auto">
        <WalletIcon className="h-6 w-6" />
      </IconTile>
      <h2
        data-panel-heading
        tabIndex={-1}
        className="mt-5 text-lg font-medium tracking-[-0.02em] text-neutral-50 outline-none"
      >
        Connect to start
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-neutral-400">{message}</p>
      <div className="mt-5 flex justify-center">
        <WalletButton />
      </div>
      <p className="mx-auto mt-4 max-w-md text-xs leading-relaxed text-neutral-500">
        Connecting lets Everspan view your public address and request transactions. Your wallet must
        approve every transaction; Everspan cannot move funds on its own.
      </p>
    </section>
  )
}
