import { useEffect, useRef, type ReactElement, type ReactNode } from 'react'
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

  useEffect(() => {
    const element = sceneRef.current
    const content = contentRef.current
    const dim = dimRef.current
    if (!stage || !element || !content || !dim) return
    return stage.register(index, { element, content, dim, length, custom })
  }, [custom, index, length, stage])

  const pinned = stage?.pinned ?? false

  return (
    <section
      ref={sceneRef}
      id={id}
      aria-label={label}
      className={`flex flex-col justify-center ${
        pinned
          ? 'absolute inset-0 overflow-hidden'
          : 'relative min-h-[100svh] py-20'
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
      <div ref={contentRef} className={pinned ? 'w-full' : undefined}>
        {children}
      </div>
      <div
        ref={dimRef}
        aria-hidden="true"
        className={pinned ? 'pointer-events-none absolute inset-0 bg-neutral-950 opacity-0' : 'hidden'}
      />
    </section>
  )
}
