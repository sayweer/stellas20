/** Hook for ephemeral toast notifications (success/error/info feedback). */
import { useContext } from 'react'
import { ToastContext, type ToastContextValue } from '../context/ToastContext'

/**
 * Access the shared toast queue + actions. Throws if used outside a ToastProvider.
 * @returns `{ toasts, notify, dismiss }`.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (ctx === null) {
    throw new Error('useToast must be used within a <ToastProvider>.')
  }
  return ctx
}
