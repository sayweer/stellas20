/** Primary product navigation — a vertical rail on desktop, a bottom bar on mobile. */
import type { CSSProperties, ReactElement } from 'react'
import { focusRing } from '../lib/buttonStyles'
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
              className={`group flex min-h-11 w-full items-center gap-3 rounded-full py-2 pl-3 pr-3 text-sm transition-colors ${
                tab.id === active
                  ? 'bg-raised font-medium text-neutral-50'
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

/**
 * The same tablist, pinned to the bottom edge on small screens.
 *
 * The indicator is a single element outside the list rather than a border on
 * the active item: sliding one box between four positions is a transform the
 * compositor can carry on its own, and it keeps the marker out of the
 * `tablist → listitem → tab` structure that assistive tech walks. It is
 * placed from a custom property, so switching tabs writes one number.
 */
export function BottomNav({ active, onChange }: SideNavProps): ReactElement {
  const activeIndex = TABS.findIndex((tab) => tab.id === active)

  return (
    <nav
      role="tablist"
      aria-label="Product sections"
      className="sticky bottom-0 z-30 border-t border-hairline bg-neutral-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="relative">
        <span
          aria-hidden="true"
          style={{ '--active-index': Math.max(activeIndex, 0) } as CSSProperties}
          className="pointer-events-none absolute inset-y-1 left-0 w-1/4 translate-x-[calc(100%*var(--active-index))] px-2 transition-transform duration-300 ease-spring motion-reduce:transition-none"
        >
          <span className="block h-full rounded-2xl bg-raised" />
        </span>
        <ul className="relative grid grid-cols-4">
          {TABS.map((tab, i) => (
            <li key={tab.id}>
              <TabButton
                tab={tab}
                index={i}
                active={active}
                onChange={onChange}
                idPrefix="tab-mobile-"
                className={`flex min-h-14 w-full select-none flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium [touch-action:manipulation] [-webkit-tap-highlight-color:transparent] transition-colors duration-100 motion-safe:active:scale-[0.94] ${
                  tab.id === active ? 'text-accent-300' : 'text-neutral-500 hover:text-neutral-200'
                }`}
              >
                <tab.Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate">{tab.label}</span>
              </TabButton>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}

interface TabButtonProps {
  tab: TabDef
  index: number
  active: TabId
  onChange: (id: TabId) => void
  /**
   * Both rails render the same tabs, so their ids have to differ. The panels
   * name themselves with `aria-label` rather than pointing back at one of
   * these: whichever rail is hidden is out of the accessibility tree, and a
   * panel labelled by a `display: none` element has no name at all — which is
   * what every panel on a phone used to be.
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
    const first = e.key === 'Home'
    const last = e.key === 'End'
    if (!forward && !back && !first && !last) return
    e.preventDefault()
    const next = first
      ? 0
      : last
        ? TABS.length - 1
        : (index + (forward ? 1 : -1) + TABS.length) % TABS.length
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
      className={`${className} ${focusRing}`}
    >
      {children}
    </button>
  )
}
