/** Top-level error boundary so an unexpected render error shows a recovery
 * card instead of a blank white screen. */
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
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
    // Surface it for debugging without leaving the user on a blank screen.
    console.error('Unhandled UI error:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div
            role="alert"
            className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300">
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
              className="mt-5 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
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
