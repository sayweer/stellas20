import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { initialClipPath, useSceneIndex, useStage } from './stageContext'

/**
 * One layer of a `ScrollStage`. While pinned, every scene occupies the same
 * full-viewport box and is revealed by the stage; in the fallback they are
 * ordinary stacked sections, so the same markup serves both modes.
 *
 * `length` scales how much scroll this scene's entrance consumes — raise it for
 * scenes that hold a multi-step visual, so they stay on screen long enough.
 */
export function ScrollScene({
  children,
  className = '',
  length = 1,
  custom = false,
  id,
  label,
}: {
  children: ReactNode
  className?: string
  length?: number
  /** Opt out of the card wipe and paint from `useSceneProgress` instead. */
  custom?: boolean
  id?: string
  label?: string
}): ReactElement {
  const stage = useStage()
  const index = useSceneIndex()
  const sceneRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const dimRef = useRef<HTMLDivElement>(null)
  const pinned = stage?.pinned ?? false
  // The hero is on screen at first paint — waiting on the observer would flash
  // it blank for a frame, so only scenes below the fold hold for entrance.
  // Reduced motion is read here too, in the initializer, rather than set from
  // inside the effect below — setting state synchronously from an effect body
  // triggers a needless extra render.
  const [revealed, setRevealed] = useState(
    () =>
      pinned ||
      index === 0 ||
      (typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  )

  useEffect(() => {
    const element = sceneRef.current
    const content = contentRef.current
    const dim = dimRef.current
    if (!stage || !element || !content || !dim) return
    return stage.register(index, { element, content, dim, length, custom })
  }, [custom, index, length, stage])

  // Pinned mode owns its entrance via the scroll-jacked stage; below `md` (or
  // under reduced motion) scenes stack as ordinary sections instead, so each
  // one gets a plain fade-and-rise the first time it crosses into view —
  // without it the fallback pops every block in at once, unrelated to scroll.
  useEffect(() => {
    if (pinned || revealed) return
    const element = sceneRef.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setRevealed(true)
        observer.disconnect()
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [pinned, revealed])

  return (
    <section
      ref={sceneRef}
      id={id}
      aria-label={label}
      className={`flex flex-col justify-center ${
        pinned ? 'absolute inset-0 overflow-hidden' : 'relative min-h-[100svh] py-20'
      } ${className}`}
      style={pinned ? { zIndex: index, clipPath: initialClipPath(index) } : undefined}
      onFocusCapture={(event) => {
        // Every scene sits at the same document offset while pinned, so the
        // browser cannot scroll a keyboard focus into view on its own — a Tab
        // into a covered scene would otherwise land on invisible content.
        // Pointer focus is excluded so a click does not fight its own handler.
        if (!pinned || !event.target.matches(':focus-visible')) return
        stage?.scrollToScene(index)
      }}
    >
      <div
        ref={contentRef}
        className={pinned ? 'w-full' : undefined}
        style={
          pinned
            ? undefined
            : {
                opacity: revealed ? 1 : 0,
                transform: revealed ? 'none' : 'translateY(24px)',
                transition: 'opacity 0.6s ease-out, transform 0.6s ease-out',
              }
        }
      >
        {children}
      </div>
      <div
        ref={dimRef}
        aria-hidden="true"
        className={
          pinned ? 'pointer-events-none absolute inset-0 bg-neutral-950 opacity-0' : 'hidden'
        }
      />
    </section>
  )
}
