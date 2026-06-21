/* eslint-disable react-refresh/only-export-components --
   The provider, context, and toast types are colocated here; the Fast Refresh
   boundary tradeoff is acceptable for a stable context. */
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'

/** Visual variant / severity of a toast. */
export type ToastVariant = 'success' | 'error' | 'info'

/** A single toast notification. */
export interface Toast {
  id: string
  variant: ToastVariant
  message: string
}

/** Toast state + actions shared across the app. */
export interface ToastContextValue {
  toasts: Toast[]
  /** Show a toast; auto-dismisses after `duration` ms (pass 0 to disable). Returns its id. */
  notify: (variant: ToastVariant, message: string, duration?: number) => string
  /** Remove a toast by id. */
  dismiss: (id: string) => void
}

/** Default auto-dismiss delay in milliseconds. */
const DEFAULT_DURATION_MS = 5000

export const ToastContext = createContext<ToastContextValue | null>(null)

/** Provides a shared toast queue to the tree. */
export function ToastProvider({ children }: { children: ReactNode }): ReactElement {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string): void => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const notify = useCallback(
    (variant: ToastVariant, message: string, duration = DEFAULT_DURATION_MS): string => {
      const id = crypto.randomUUID()
      setToasts((prev) => [...prev, { id, variant, message }])
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => {
            dismiss(id)
          }, duration),
        )
      }
      return id
    },
    [dismiss],
  )

  // Clear any pending timers on unmount.
  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((timer) => {
        clearTimeout(timer)
      })
    }
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, notify, dismiss }),
    [toasts, notify, dismiss],
  )

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}
