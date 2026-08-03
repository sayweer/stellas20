/** Primary product navigation — a vertical rail on desktop, a bottom bar on mobile. */
import type { ReactElement } from 'react'
import { ChartBarIcon, SlidersIcon, SwapIcon, WalletIcon } from './icons'

export type TabId = 'overview' | 'earn' | 'portfolio' | 'more'

interface TabDef {
  id: TabId
  label: string
  Icon: (props: { className?: string }) => ReactElement
}

const TABS: TabDef[] = [
  { id: 'overview', label: 'Overview', Icon: ChartBarIcon },
  { id: 'earn', label: 'Earn', Icon: SwapIcon },
  { id: 'portfolio', label: 'Portfolio', Icon: WalletIcon },
  { id: 'more', label: 'More', Icon: SlidersIcon },
]

interface SideNavProps {
  active: TabId
  onChange: (id: TabId) => void
}

/**
 * One tablist rendered twice — vertical beside the content on desktop, pinned
 * to the bottom edge on mobile. Only one is in the accessibility tree at a
 * time (the other is `hidden`), so screen readers never see duplicate tabs.
 */
export function SideNav({ active, onChange }: SideNavProps): ReactElement {
  return (
    <nav
      role="tablist"
      aria-orientation="vertical"
      aria-label="Product sections"
      className="hidden lg:block"
    >
      <ul className="space-y-0.5">
        {TABS.map((tab, i) => (
          <li key={tab.id}>
            <TabButton
              tab={tab}
              index={i}
              active={active}
              onChange={onChange}
              idPrefix="tab-"
              className={`group flex min-h-11 w-full items-center gap-3 rounded-lg py-2 pl-3 pr-3 text-sm transition-colors ${
                tab.id === active
                  ? 'bg-neutral-800 font-medium text-neutral-50'
                  : 'text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-4 w-0.5 shrink-0 rounded-full transition-colors ${
                  tab.id === active ? 'bg-accent-500' : 'bg-transparent'
                }`}
              />
              <tab.Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{tab.label}</span>
            </TabButton>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** The same tablist, pinned to the bottom edge on small screens. */
export function BottomNav({ active, onChange }: SideNavProps): ReactElement {
  return (
    <nav
      role="tablist"
      aria-label="Product sections"
      className="sticky bottom-0 z-30 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur lg:hidden"
    >
      <ul className="grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {TABS.map((tab, i) => (
          <li key={tab.id}>
            <TabButton
              tab={tab}
              index={i}
              active={active}
              onChange={onChange}
              idPrefix="tab-mobile-"
              className={`flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors ${
                tab.id === active ? 'text-accent-300' : 'text-neutral-500 hover:text-neutral-200'
              }`}
            >
              <tab.Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate">{tab.label}</span>
            </TabButton>
          </li>
        ))}
      </ul>
    </nav>
  )
}

interface TabButtonProps {
  tab: TabDef
  index: number
  active: TabId
  onChange: (id: TabId) => void
  /**
   * Both rails render the same tabs, so their ids have to differ. The desktop
   * rail keeps the bare `tab-` prefix because the panels point back at it.
   */
  idPrefix: string
  className: string
  children: ReactElement | ReactElement[]
}

function TabButton({
  tab,
  index,
  active,
  onChange,
  idPrefix,
  className,
  children,
}: TabButtonProps): ReactElement {
  const selected = tab.id === active

  function onKeyDown(e: React.KeyboardEvent): void {
    const forward = e.key === 'ArrowDown' || e.key === 'ArrowRight'
    const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft'
    if (!forward && !back) return
    e.preventDefault()
    const next = (index + (forward ? 1 : -1) + TABS.length) % TABS.length
    onChange(TABS[next].id)
    document.getElementById(`${idPrefix}${TABS[next].id}`)?.focus()
  }

  return (
    <button
      id={`${idPrefix}${tab.id}`}
      role="tab"
      type="button"
      aria-selected={selected}
      aria-controls={`panel-${tab.id}`}
      tabIndex={selected ? 0 : -1}
      onClick={() => {
        onChange(tab.id)
      }}
      onKeyDown={onKeyDown}
      className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60`}
    >
      {children}
    </button>
  )
}
