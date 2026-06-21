/** Renders the live toast list from useToast, accessible via role=status / role=alert. */
import type { ReactElement } from 'react'
import { useToast } from '../hooks/useToast'
import type { ToastVariant } from '../context/ToastContext'
import { AlertTriangleIcon, CheckCircleIcon, InfoIcon, XIcon } from './icons'

interface VariantStyle {
  border: string
  icon: string
  role: 'status' | 'alert'
  live: 'polite' | 'assertive'
  Icon: (props: { className?: string }) => ReactElement
}

const VARIANTS: Record<ToastVariant, VariantStyle> = {
  success: {
    border: 'border-emerald-500/30',
    icon: 'text-emerald-400',
    role: 'status',
    live: 'polite',
    Icon: CheckCircleIcon,
  },
  error: {
    border: 'border-rose-500/30',
    icon: 'text-rose-400',
    role: 'alert',
    live: 'assertive',
    Icon: AlertTriangleIcon,
  },
  info: {
    border: 'border-neutral-700',
    icon: 'text-neutral-300',
    role: 'status',
    live: 'polite',
    Icon: InfoIcon,
  },
}

export function Toast(): ReactElement | null {
  const { toasts, dismiss } = useToast()
  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end">
      {toasts.map((toast) => {
        const variant = VARIANTS[toast.variant]
        const Icon = variant.Icon
        return (
          <div
            key={toast.id}
            role={variant.role}
            aria-live={variant.live}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border ${variant.border} bg-neutral-900 p-3.5 shadow-lg shadow-black/40 motion-safe:animate-toast-in`}
          >
            <Icon className={`h-5 w-5 shrink-0 ${variant.icon}`} />
            <p className="flex-1 pt-0.5 text-sm text-neutral-200">{toast.message}</p>
            <button
              type="button"
              onClick={() => {
                dismiss(toast.id)
              }}
              aria-label="Dismiss notification"
              className="-m-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
