/**
 * The Stellar mark, in `currentColor`.
 *
 * Kept apart from `icons.tsx` for the same reason `BrandMark` is: those are
 * stroked 24-unit glyphs we drew, this is a 236-unit filled asset that belongs
 * to someone else. It denotes the network or the asset — the settlement, the
 * XLM balance, the testnet badge — and never sits beside the Everspan mark,
 * where two stars at the same size would read as one confused identity.
 */
import { useEffect, useRef, type ReactElement } from 'react'

interface StellarMarkProps {
  className?: string
  /**
   * Runs the settling animation. Reserved for the wait that actually is the
   * network settling a transaction; everywhere else the mark is still, and a
   * plain spinner covers ordinary waiting.
   */
  settling?: boolean
}

export function StellarMark({
  className = 'h-4 w-4',
  settling = false,
}: StellarMarkProps): ReactElement {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!settling) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const paths = ref.current?.querySelectorAll('path')
    if (!paths || paths.length < 2) return

    let cancelled = false
    let context: { revert: () => void } | undefined
    // Loaded on demand: GSAP is the marketing route's dependency, and the app
    // should not carry it just in case somebody eventually signs something.
    void import('../lib/gsap').then(({ gsap }) => {
      if (cancelled) return
      context = gsap.context(() => {
        gsap
          .timeline({ repeat: -1, repeatDelay: 0.15 })
          .fromTo(
            paths[0],
            { opacity: 0.2, xPercent: -6 },
            { opacity: 1, xPercent: 0, duration: 0.55, ease: 'power2.out' },
          )
          .fromTo(
            paths[1],
            { opacity: 0.2, xPercent: 6 },
            { opacity: 1, xPercent: 0, duration: 0.55, ease: 'power2.out' },
            '-=0.3',
          )
          .to([paths[0], paths[1]], { opacity: 0.3, duration: 0.5, ease: 'power1.inOut' }, '+=0.25')
      }, ref.current ?? undefined)
    })

    return () => {
      cancelled = true
      context?.revert()
    }
  }, [settling])

  return (
    <svg
      ref={ref}
      viewBox="0 0 236.36 200"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M203,26.16l-28.46,14.5-137.43,70a82.49,82.49,0,0,1-.7-10.69A81.87,81.87,0,0,1,158.2,28.6l16.29-8.3,2.43-1.24A100,100,0,0,0,18.18,100q0,3.82.29,7.61a18.19,18.19,0,0,1-9.88,17.58L0,129.57V150l25.29-12.89,0,0,8.19-4.18,8.07-4.11v0L186.43,55l16.28-8.29,33.65-17.15V9.14Z" />
      <path d="M236.36,50,49.78,145,33.5,153.31,0,170.38v20.41l33.27-16.95,28.46-14.5L199.3,89.24A83.45,83.45,0,0,1,200,100,81.87,81.87,0,0,1,78.09,171.36l-1,.53-17.66,9A100,100,0,0,0,218.18,100c0-2.57-.1-5.14-.29-7.68a18.2,18.2,0,0,1,9.87-17.58l8.6-4.38Z" />
    </svg>
  )
}
