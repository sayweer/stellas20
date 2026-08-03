import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'

/* ─────────────────────────────────────────────────────────
 * WELCOME INTRO STORYBOARD
 *
 *    0ms   black brand field is visible with “Hello”
 *  220ms   greetings begin cycling in place
 * 1030ms   “Hallo” appears
 * 1165ms   final greeting changes to “Merhaba”
 * 1720ms   black field exits upward with a curved edge
 * 2320ms   intro unmounts; the landing page remains
 * ───────────────────────────────────────────────────────── */

const GREETINGS = [
  'Hello',
  'Bonjour',
  'Ciao',
  'Olá',
  'こんにちは',
  'Hallå',
  'Guten Tag',
  'Hallo',
  'Merhaba',
]

const INTRO_TIMING = {
  wordStart: 220,
  wordStep: 135,
  exit: 1720,
  complete: 2320,
} as const

const INTRO_SESSION_KEY = 'everspan:welcome-intro:v1'
const BACKGROUND_IDS = ['landing-content', 'transaction-safety-banner', 'toast-region'] as const

function setBackgroundInert(inert: boolean): void {
  BACKGROUND_IDS.forEach((id) => {
    const element = document.getElementById(id)
    if (inert) element?.setAttribute('inert', '')
    else element?.removeAttribute('inert')
  })
}

export function WelcomeIntro(): ReactElement | null {
  const [stage, setStage] = useState(0)
  const [wordIndex, setWordIndex] = useState(0)
  const [shouldRender, setShouldRender] = useState(shouldShowIntro)
  const previousOverflow = useRef('')
  const skipButton = useRef<HTMLButtonElement | null>(null)

  const completeIntro = useCallback(() => {
    try {
      sessionStorage.setItem(INTRO_SESSION_KEY, 'seen')
    } catch {
      // The intro can still complete when private browsing blocks storage.
    }
    setBackgroundInert(false)
    document.body.style.overflow = previousOverflow.current
    document.getElementById('landing-main')?.focus({ preventScroll: true })
    setShouldRender(false)
  }, [])

  useEffect(() => {
    if (!shouldRender) return

    previousOverflow.current = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setBackgroundInert(true)
    skipButton.current?.focus()

    const timers: ReturnType<typeof setTimeout>[] = GREETINGS.slice(1).map((_, index) =>
      setTimeout(
        () => setWordIndex(index + 1),
        INTRO_TIMING.wordStart + index * INTRO_TIMING.wordStep,
      ),
    )

    timers.push(setTimeout(() => setStage(1), INTRO_TIMING.exit))
    timers.push(setTimeout(completeIntro, INTRO_TIMING.complete))

    return () => {
      timers.forEach(clearTimeout)
      setBackgroundInert(false)
      document.body.style.overflow = previousOverflow.current
    }
  }, [completeIntro, shouldRender])

  if (!shouldRender) return null

  return (
    <div
      className="intro-screen"
      data-stage={stage >= 1 ? 'exit' : 'greeting'}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Everspan"
      onKeyDown={(event) => {
        if (event.key === 'Escape') completeIntro()
        if (event.key === 'Tab') {
          event.preventDefault()
          skipButton.current?.focus()
        }
      }}
    >
      <span className="sr-only">Welcome to Everspan</span>
      <p className="intro-word" aria-hidden="true">
        <span className="intro-dot" />
        <span>{GREETINGS[wordIndex]}</span>
      </p>
      <button
        ref={skipButton}
        type="button"
        onClick={completeIntro}
        className="absolute right-5 top-5 z-10 min-h-11 rounded-full border border-neutral-50/40 px-4 text-xs font-medium text-neutral-50 transition-colors duration-100 hover:border-neutral-50/60 hover:bg-neutral-50/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-50 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 sm:right-8 sm:top-8"
      >
        Skip intro
      </button>
    </div>
  )
}

function shouldShowIntro(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  try {
    return sessionStorage.getItem(INTRO_SESSION_KEY) !== 'seen'
  } catch {
    return true
  }
}
