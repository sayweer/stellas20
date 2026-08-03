import type { ReactElement } from 'react'
import { useTransactionSafety } from '../context/TransactionSafetyContext'
import { AlertTriangleIcon } from './icons'

/** Keeps a dropped connection from looking like a failed or frozen transaction. */
export function ConnectionBanner(): ReactElement | null {
  const { online, persistenceAvailable } = useTransactionSafety()

  if (online && persistenceAvailable) return null

  return (
    <div role="alert" className="border-b border-negative-500/30 bg-negative-500/10">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 text-sm text-negative-100 lg:px-6">
        <AlertTriangleIcon className="h-5 w-5 shrink-0 text-negative-400" />
        <p>
          <span className="font-semibold">
            {online ? 'Secure transaction protection is unavailable.' : 'Connection lost.'}
          </span>{' '}
          {online
            ? 'Transactions are paused. Use a current browser, enable site storage, and reload.'
            : 'Your form is preserved. No new transaction can be submitted until you are back online.'}
        </p>
      </div>
    </div>
  )
}
