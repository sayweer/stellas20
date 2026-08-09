/** The two pressable primitives every control in the app is built from. */
import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'
import { buttonClasses, iconButtonClasses, type ButtonStyleOptions } from '../lib/buttonStyles'
import { Spinner } from './icons'

type NativeButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>

interface ButtonOwnProps extends ButtonStyleOptions {
  /** Working, but not unavailable — see the note on the disabled split below. */
  pending?: boolean
  pendingLabel?: string
  children: ReactNode
}

export type ButtonProps = ButtonOwnProps & NativeButtonProps

/**
 * A text button.
 *
 * The whole native button attribute surface is passed through on purpose. The
 * app had grown two dozen hand-written buttons for one reason: the shared one
 * could not carry a `title`, an `aria-expanded` or an `onKeyDown`, so every
 * control that needed one was rewritten from scratch. An open prop surface is
 * what lets them come back.
 *
 * `disabled` and `pending` are different states and are spelled differently.
 * `disabled` means unavailable (wrong network, no liquidity, nothing to spend)
 * and gets the real attribute. `pending` means working, and a real `disabled`
 * there would drop the control out of the focus order mid-interaction — the
 * keyboard reader who just pressed Enter would find themselves back at the top
 * of the document. So `pending` is `aria-disabled` plus a guarded handler: the
 * press does nothing, but the control keeps the focus.
 */
export function Button({
  variant,
  size,
  full,
  pending = false,
  pendingLabel = 'Working…',
  children,
  className = '',
  onClick,
  type = 'button',
  ...rest
}: ButtonProps): ReactElement {
  return (
    <button
      type={type}
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      onClick={
        pending
          ? (event) => {
              event.preventDefault()
            }
          : onClick
      }
      className={`${buttonClasses({ variant, size, full })} ${className}`}
      {...rest}
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

interface IconButtonOwnProps extends Omit<ButtonStyleOptions, 'full'> {
  /**
   * Required, and that is the point: an icon-only control has no text to name
   * it, so the type system is where the accessible name is guaranteed rather
   * than the review that forgets one of nine call sites.
   */
  label: string
  icon: ReactElement
  pending?: boolean
}

export type IconButtonProps = IconButtonOwnProps & Omit<NativeButtonProps, 'aria-label' | 'title'>

/** A square icon-only control with a 44px target. */
export function IconButton({
  variant,
  size,
  label,
  icon,
  pending = false,
  className = '',
  onClick,
  type = 'button',
  ...rest
}: IconButtonProps): ReactElement {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      onClick={
        pending
          ? (event) => {
              event.preventDefault()
            }
          : onClick
      }
      className={`${iconButtonClasses({ variant, size })} ${className}`}
      {...rest}
    >
      {pending ? <Spinner className="h-4 w-4" /> : icon}
    </button>
  )
}
