/** Renders the live toast list from useToast, accessible via role=status / role=alert. */
import type { ReactElement } from 'react'
import { useToast } from '../hooks/useToast'
import type { ToastVariant } from '../context/ToastContext'
import { IconButton } from './Button'
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
    border: 'border-positive-500/30',
    icon: 'text-positive-400',
    role: 'status',
    live: 'polite',
    Icon: CheckCircleIcon,
  },
  error: {
    border: 'border-negative-500/30',
    icon: 'text-negative-400',
    role: 'alert',
    live: 'assertive',
    Icon: AlertTriangleIcon,
  },
  info: {
    border: 'border-boundary',
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
    <div
      id="toast-region"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 p-4 sm:items-end lg:bottom-0"
    >
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
            <IconButton
              variant="ghost"
              label="Dismiss notification"
              icon={<XIcon className="h-4 w-4" />}
              onClick={() => {
                dismiss(toast.id)
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
