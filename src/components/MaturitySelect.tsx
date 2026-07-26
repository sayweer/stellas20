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
        className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 transition-colors focus:border-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/30"
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
