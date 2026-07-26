/** Top app bar: brand + Testnet indicator, with the wallet control on the right. */
import type { ReactElement } from 'react'
import { WalletButton } from './WalletButton'
import { BrandMark } from './BrandMark'

export function Header(): ReactElement {
  return (
    <header className="sticky top-0 z-30 border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark className="h-7 w-7 shrink-0 text-neutral-50" />
          <div className="flex min-w-0 flex-col leading-none">
            <span className="truncate text-sm font-semibold text-neutral-100">stellas20</span>
            <span className="mt-1 hidden text-[11px] font-medium uppercase tracking-wider text-neutral-500 sm:block">
              PT/YT · Testnet
            </span>
          </div>
        </div>
        <WalletButton />
      </div>
    </header>
  )
}
