/** Small reusable form primitives shared across the action cards. */
import type { ReactElement, ReactNode } from 'react'
import { Spinner } from './icons'

const inputClass =
  'w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 pr-16 text-sm text-neutral-100 placeholder:text-neutral-600 font-mono tabular-nums transition-colors focus:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 aria-[invalid=true]:border-rose-500/70'

interface AmountFieldProps {
  id: string
  value: string
  onChange: (value: string) => void
  unit: string
  hint: string
  error: string | null
  onEnter?: () => void
}

/** A labelled decimal amount input with a unit suffix, hint, and inline error. */
export function AmountField({
  id,
  value,
  onChange,
  unit,
  hint,
  error,
  onEnter,
}: AmountFieldProps): ReactElement {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-neutral-300">
        Amount
      </label>
      <div className="relative">
        <input
          id={id}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEnter?.()
          }}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="0.0"
          aria-invalid={error !== null ? 'true' : undefined}
          aria-describedby={error !== null ? `${id}-error` : `${id}-hint`}
          className={inputClass}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-neutral-500">
          {unit}
        </span>
      </div>
      {error !== null ? (
        <p id={`${id}-error`} className="text-xs text-rose-400">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="text-xs text-neutral-500">
          {hint}
        </p>
      )}
    </div>
  )
}

interface TabToggleProps {
  options: { id: string; label: string }[]
  active: string
  onChange: (id: string) => void
  className?: string
}

/** A two-or-more segmented control for switching an action's mode. */
export function TabToggle({ options, active, onChange, className = '' }: TabToggleProps): ReactElement {
  return (
    <div className={`inline-flex rounded-lg border border-neutral-800 bg-neutral-950 p-1 ${className}`}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => {
            onChange(opt.id)
          }}
          aria-pressed={active === opt.id}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
            active === opt.id
              ? 'bg-neutral-800 text-neutral-100'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

interface ActionButtonProps {
  onClick: () => void
  disabled?: boolean
  pending?: boolean
  pendingLabel: string
  children: ReactNode
  variant?: 'primary' | 'secondary'
  className?: string
}

/** The primary/secondary submit button used by the action cards. */
export function ActionButton({
  onClick,
  disabled,
  pending,
  pendingLabel,
  children,
  variant = 'primary',
  className = '',
}: ActionButtonProps): ReactElement {
  const base =
    'inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:opacity-50'
  const styles =
    variant === 'primary'
      ? 'bg-emerald-500 text-neutral-950 hover:bg-emerald-400 focus-visible:ring-emerald-400 active:bg-emerald-600'
      : 'border border-neutral-700 text-neutral-200 hover:bg-neutral-800 focus-visible:ring-emerald-500/60'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      aria-busy={pending}
      className={`${base} ${styles} ${className}`}
    >
      {pending ? (
        <>
          <Spinner className="h-4 w-4" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  )
}
