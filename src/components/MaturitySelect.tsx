/** Dropdown for choosing a maturity, shown as a human-readable date. */
import type { ReactElement } from 'react'
import { formatMaturity } from '../lib/format'

/** A selectable maturity with a matured flag for labeling. */
export interface MaturityOption {
  maturity: bigint
  matured: boolean
}

interface MaturitySelectProps {
  options: MaturityOption[]
  value: bigint | null
  onChange: (maturity: bigint) => void
}

/*
 * `text-base sm:text-sm` for the same reason as the amount field: iOS Safari
 * zooms the page in when a control with a font under 16px takes focus.
 */
const selectClass =
  'min-h-12 w-full rounded-xl border border-boundary bg-neutral-950 px-3 py-2.5 text-base text-neutral-100 transition-colors focus:border-accent-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-300 sm:text-sm'

export function MaturitySelect({ options, value, onChange }: MaturitySelectProps): ReactElement {
  return (
    <div className="space-y-1.5">
      <label htmlFor="maturity-select" className="block text-sm font-medium text-neutral-300">
        Maturity
      </label>
      <select
        id="maturity-select"
        value={value === null ? '' : value.toString()}
        onChange={(e) => {
          onChange(BigInt(e.target.value))
        }}
        className={selectClass}
      >
        {options.map((opt) => (
          <option key={opt.maturity.toString()} value={opt.maturity.toString()}>
            {formatMaturity(opt.maturity)}
            {opt.matured ? ' (matured)' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
