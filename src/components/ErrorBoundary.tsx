/** Top-level error boundary so an unexpected render error shows a recovery
 * card instead of a blank white screen. */
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import * as Sentry from '@sentry/react'
import { config } from '../config'
import { AlertTriangleIcon } from './icons'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (config.sentryDsn) {
      Sentry.captureException(error, { extra: { componentStack: info.componentStack } })
    }
    // Surface it for debugging without leaving the user on a blank screen.
    console.error('Unhandled UI error:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div
            role="alert"
            className="w-full max-w-md rounded-2xl border border-negative-500/30 bg-negative-500/10 p-6 text-center"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-negative-500/15 text-negative-300">
              <AlertTriangleIcon className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-lg font-semibold text-neutral-50">Something went wrong</h1>
            <p className="mt-2 text-sm text-neutral-400">
              An unexpected error occurred. Reloading usually fixes it.
            </p>
            <button
              type="button"
              onClick={() => {
                window.location.reload()
              }}
              className="mt-5 min-h-11 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-onAccent transition-colors duration-100 hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
