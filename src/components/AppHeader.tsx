/** The app's top bar: one row at every width. */
import { useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { markets, type MarketKey } from '../config'
import { buttonClasses, iconButtonClasses } from '../lib/buttonStyles'
import { BottomSheet } from './BottomSheet'
import { BrandMark } from './BrandMark'
import { ChevronDownIcon } from './icons'
import { MarketSwitcher } from './MarketSwitcher'
import { ThemeToggle } from './ThemeToggle'
import { WalletButton } from './WalletButton'

interface AppHeaderProps {
  marketKey: MarketKey
  onSwitchMarket: (key: MarketKey) => void
}

/**
 * A leaf component on purpose: it owns the market sheet's open state, and
 * anything stateful living higher would re-render the whole panel tree on
 * every open and close.
 *
 * The bar holds one row at every width. It used to be a wrapping flex row, so
 * a phone got two lines and a 320px screen got four — a quarter of the visible
 * page spent on chrome before a single figure. What made that possible was
 * moving the market switcher behind a chip: it is a control a reader touches
 * once a session, and it was claiming a full-width row permanently.
 */
export function AppHeader({ marketKey, onSwitchMarket }: AppHeaderProps): ReactElement {
  const [marketSheetOpen, setMarketSheetOpen] = useState(false)
  const switchable = markets.length > 1
  const current = markets.find((market) => market.key === marketKey) ?? markets[0]

  return (
    <header className="sticky top-[env(safe-area-inset-top)] z-20 -mx-4 flex h-14 items-center gap-2 border-b border-hairline bg-neutral-950/90 px-4 backdrop-blur lg:mx-0 lg:h-16 lg:px-0">
      {/* Below 375px the row cannot hold the mark, the market chip and a wallet
          control at once, and of the three the mark is the one the reader is
          not there for — the More panel carries the way home instead. */}
      <Link
        to="/"
        aria-label="Everspan home"
        className={`${iconButtonClasses({ variant: 'ghost' })} -ml-2 hidden min-[375px]:inline-flex lg:hidden`}
      >
        <BrandMark className="h-6 w-6 text-neutral-50" />
      </Link>

      {switchable && (
        <>
          <div className="hidden lg:block">
            <MarketSwitcher active={marketKey} onChange={onSwitchMarket} />
          </div>
          <button
            id="market-trigger"
            type="button"
            aria-haspopup="dialog"
            aria-expanded={marketSheetOpen}
            onClick={() => {
              setMarketSheetOpen(true)
            }}
            className={`${buttonClasses({ variant: 'secondary' })} min-w-0 lg:hidden`}
          >
            <span className="truncate">{current.label}</span>
            <ChevronDownIcon className="h-4 w-4 shrink-0 text-neutral-400" />
          </button>
        </>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/* A preference, not a task: on a phone it lives in the More panel so
            the row can spend its width on the market and the wallet. */}
        <span className="hidden sm:inline-flex">
          <ThemeToggle />
        </span>
        <WalletButton />
      </div>

      {switchable && (
        <BottomSheet
          open={marketSheetOpen}
          onClose={() => {
            setMarketSheetOpen(false)
          }}
          title="Yield source"
        >
          <MarketSwitcher
            active={marketKey}
            layout="stacked"
            idPrefix="market-sheet-"
            onChange={(key) => {
              setMarketSheetOpen(false)
              onSwitchMarket(key)
            }}
          />
          <p className="mt-4 text-xs leading-relaxed text-neutral-400">
            Each source is a separate deployment. Switching reloads balances and positions from that
            market.
          </p>
        </BottomSheet>
      )}
    </header>
  )
}
