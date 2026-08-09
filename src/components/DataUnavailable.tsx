import type { ReactElement } from 'react'
import type { AppError } from '../types'
import { AlertTriangleIcon } from './icons'
import { Button } from './Button'

interface DataUnavailableProps {
  error: AppError
  onRetry: () => void
  /** Set when this fallback replaces a primary tab panel. */
  tab?: string
}

/** Explicit fail-closed state for account data required by financial actions. */
export function DataUnavailable({ error, onRetry, tab }: DataUnavailableProps): ReactElement {
  return (
    <section
      id={tab ? `panel-${tab}` : undefined}
      role={tab ? 'tabpanel' : undefined}
      aria-labelledby={tab ? `tab-${tab}` : undefined}
    >
      <div
        role="alert"
        className="rounded-2xl border border-negative-500/40 bg-negative-500/10 p-5 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <AlertTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-negative-300" />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-negative-100">
              Financial actions are paused
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-negative-200/90">{error.message}</p>
            <p className="mt-2 text-xs leading-relaxed text-negative-200/80">
              Everspan will not treat an unread balance or position as zero. Refresh the verified
              data before continuing.
            </p>
            <Button variant="danger" onClick={onRetry} className="mt-4">
              Refresh verified data
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
