/** Small reusable form primitives shared across the action cards. */
import type { ReactElement, ReactNode } from 'react'
import { Spinner } from './icons'

const inputClass =
  'w-full min-h-12 rounded-lg border border-boundary bg-neutral-950 px-3 py-3 text-sm text-neutral-100 placeholder:text-neutral-500 font-mono tabular-nums transition-[color,background-color,border-color,box-shadow] duration-100 focus:border-accent-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 aria-[invalid=true]:border-negative-300'

interface AmountFieldProps {
  id: string
  value: string
  onChange: (value: string) => void
  unit: string
  hint: string
  error: string | null
  onEnter?: () => void
  disabled?: boolean
  /** When set, renders a MAX button that fills the field with this value. */
  onMax?: () => void
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
  disabled,
  onMax,
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
          disabled={disabled}
          aria-invalid={error !== null ? 'true' : undefined}
          aria-describedby={error !== null ? `${id}-error` : `${id}-hint`}
          className={`${inputClass} ${onMax ? 'pr-24' : 'pr-16'} disabled:cursor-not-allowed disabled:opacity-50`}
        />
        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center gap-2">
          {onMax && (
            <button
              type="button"
              onClick={onMax}
              disabled={disabled}
              className="pointer-events-auto inline-flex min-h-11 items-center rounded-md border border-boundary px-2 text-[11px] font-semibold text-accent-300 transition-colors duration-100 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 disabled:opacity-50"
            >
              MAX
            </button>
          )}
          <span className="text-sm font-medium text-neutral-400">{unit}</span>
        </div>
      </div>
      {error !== null ? (
        <p id={`${id}-error`} aria-live="polite" className="text-xs text-negative-300">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="text-xs text-neutral-400">
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
  /** Accessible name for the segmented control (announced as the group label). */
  label: string
  className?: string
}

/** A two-or-more segmented control for switching an action's mode. */
export function TabToggle({
  options,
  active,
  onChange,
  label,
  className = '',
}: TabToggleProps): ReactElement {
  return (
    <div
      role="group"
      aria-label={label}
      className={`grid w-full rounded-lg border border-boundary bg-neutral-950 p-1 sm:inline-flex sm:w-auto ${className}`}
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => {
            onChange(opt.id)
          }}
          aria-pressed={active === opt.id}
          className={`min-h-11 whitespace-normal rounded-md px-3 py-2 text-sm font-medium leading-snug transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 ${
            active === opt.id
              ? 'bg-raised text-neutral-100'
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
  pendingLabel?: string
  children: ReactNode
  variant?: 'primary' | 'secondary'
  className?: string
}

/** The primary/secondary submit button used by the action cards. */
export function ActionButton({
  onClick,
  disabled,
  pending,
  pendingLabel = 'Working…',
  children,
  variant = 'primary',
  className = '',
}: ActionButtonProps): ReactElement {
  const base =
    'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-[color,background-color,border-color,transform] duration-100 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 active:translate-y-px disabled:cursor-not-allowed disabled:transform-none'
  const styles =
    variant === 'primary'
      ? 'bg-accent-500 text-onAccent hover:bg-accent-400 focus-visible:ring-accent-300 active:bg-accent-600 disabled:bg-raised disabled:text-neutral-600'
      : 'border border-boundary text-neutral-200 hover:bg-raised focus-visible:ring-accent-300 disabled:border-hairline disabled:text-neutral-600'
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
