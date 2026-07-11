/** Dropdown for choosing a maturity, shown as a human-readable date. */
import type { ReactElement } from 'react'
import { formatMaturity } from '../lib/format'

interface MaturitySelectProps {
  maturities: bigint[]
  value: bigint | null
  onChange: (maturity: bigint) => void
}

export function MaturitySelect({ maturities, value, onChange }: MaturitySelectProps): ReactElement {
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
        className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 transition-colors focus:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
      >
        {maturities.map((m) => (
          <option key={m.toString()} value={m.toString()}>
            {formatMaturity(m)}
          </option>
        ))}
      </select>
    </div>
  )
}
