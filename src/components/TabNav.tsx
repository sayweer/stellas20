/** Primary product navigation — an accessible, responsive tablist. */
import type { ReactElement } from 'react'
import { ChartBarIcon, LayersIcon, SlidersIcon, SwapIcon, WalletIcon } from './icons'

export type TabId = 'markets' | 'trade' | 'pool' | 'portfolio' | 'advanced'

interface TabDef {
  id: TabId
  label: string
  Icon: (props: { className?: string }) => ReactElement
}

const TABS: TabDef[] = [
  { id: 'markets', label: 'Markets', Icon: ChartBarIcon },
  { id: 'trade', label: 'Trade', Icon: SwapIcon },
  { id: 'pool', label: 'Pool', Icon: LayersIcon },
  { id: 'portfolio', label: 'Portfolio', Icon: WalletIcon },
  { id: 'advanced', label: 'Advanced', Icon: SlidersIcon },
]

interface TabNavProps {
  active: TabId
  onChange: (id: TabId) => void
}

/**
 * Five-way product nav. Roving-focus tablist with arrow-key support; the panels
 * it controls carry `role="tabpanel"`. Fits 375px as an equal-columns grid with
 * the label under the icon.
 */
export function TabNav({ active, onChange }: TabNavProps): ReactElement {
  function onKeyDown(e: React.KeyboardEvent, index: number): void {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const dir = e.key === 'ArrowRight' ? 1 : -1
    const next = (index + dir + TABS.length) % TABS.length
    onChange(TABS[next].id)
    document.getElementById(`tab-${TABS[next].id}`)?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="Product sections"
      className="grid grid-cols-5 gap-1 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-1"
    >
      {TABS.map((tab, i) => {
        const selected = tab.id === active
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              onChange(tab.id)
            }}
            onKeyDown={(e) => {
              onKeyDown(e, i)
            }}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2.5 text-center text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 sm:flex-row sm:gap-2 sm:py-2 sm:text-sm ${
              selected
                ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/25'
                : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-100'
            }`}
          >
            <tab.Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}
