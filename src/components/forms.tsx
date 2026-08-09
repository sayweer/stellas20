/** Small reusable form primitives shared across the action cards. */
import type { ReactElement, ReactNode } from 'react'
import { Button } from './Button'
import { segmentClasses, segmentTrackClass } from '../lib/buttonStyles'

/*
 * `text-base sm:text-sm` is not a typographic choice: iOS Safari zooms the
 * whole page in when a field with a font smaller than 16px takes focus, and
 * leaves the reader zoomed and scrolled sideways. 16px on phones, the original
 * 14px from `sm` up.
 */
const inputClass =
  'w-full min-h-12 rounded-xl border border-boundary bg-neutral-950 px-4 py-3 text-base text-neutral-100 placeholder:text-neutral-500 font-mono tabular-nums transition-[color,background-color,border-color,box-shadow] duration-100 focus:border-accent-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-300 aria-[invalid=true]:border-negative-300 sm:text-sm'

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
            <Button
              variant="secondary"
              size="sm"
              onClick={onMax}
              disabled={disabled}
              className="pointer-events-auto"
            >
              {/* The accent tint lives on the label, not on the button: a
                  `text-*` utility passed alongside the variant would be settled
                  by Tailwind's output order rather than by intent. */}
              <span className="text-accent-300">MAX</span>
            </Button>
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
      className={`grid w-full rounded-2xl bg-neutral-950 sm:inline-flex sm:w-auto sm:rounded-full ${segmentTrackClass} ${className}`}
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => {
            onChange(opt.id)
          }}
          aria-pressed={active === opt.id}
          className={segmentClasses(active === opt.id)}
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

/**
 * The submit button used by the action cards.
 *
 * Kept as its own name so the twelve call sites do not have to churn, but it
 * is now only a shape: `Button` owns the paint, the press behaviour and the
 * pending semantics.
 */
export function ActionButton({
  onClick,
  disabled,
  pending,
  pendingLabel = 'Working…',
  children,
  variant = 'primary',
  className = '',
}: ActionButtonProps): ReactElement {
  return (
    <Button
      variant={variant}
      size="lg"
      full
      onClick={onClick}
      disabled={disabled}
      pending={pending}
      pendingLabel={pendingLabel}
      className={className}
    >
      {children}
    </Button>
  )
}
