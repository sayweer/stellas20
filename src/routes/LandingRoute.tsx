import { Suspense, lazy, type ReactElement } from 'react'

/**
 * Split point for the marketing route. It carries GSAP for its scroll stage,
 * which visitors opening /app directly never need — so the chunk only loads
 * when someone actually lands on `/`.
 */
const Landing = lazy(async () => ({ default: (await import('./Landing')).Landing }))

export function LandingRoute(): ReactElement {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-50" />}>
      <Landing />
    </Suspense>
  )
}
