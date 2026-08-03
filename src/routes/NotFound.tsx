/** Catch-all route. Without it an unknown path renders nothing at all. */
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { useSurface } from '../hooks/useSurface'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export function NotFound(): ReactElement {
  useSurface('site')
  useDocumentTitle('Page not found — Everspan')

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <BrandMark className="h-10 w-10" />
      <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-600">
        Error 404
      </p>
      <h1 className="mt-4 text-[clamp(2rem,5vw,3.5rem)] font-medium leading-[1.02] tracking-[-0.035em]">
        This page doesn’t exist.
      </h1>
      <p className="mt-5 max-w-md text-neutral-600">
        The link may be out of date. Everything the protocol does lives on the two pages below.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/"
          className="inline-flex items-center rounded-full bg-accent-500 px-6 py-3.5 text-sm font-medium text-neutral-50 transition-colors hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50"
        >
          Back home
        </Link>
        <Link
          to="/app"
          className="inline-flex items-center rounded-full border border-boundary px-6 py-3.5 text-sm font-medium transition-colors hover:bg-neutral-950/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50"
        >
          Launch App
        </Link>
      </div>
    </main>
  )
}
