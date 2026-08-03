import {
  Children,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react'
import { gsap, ScrollTrigger, whenIntroSettled } from '../../lib/gsap'
import {
  SCENE_LENGTH_VH,
  SceneIndexContext,
  StageContext,
  dwellProgress,
  paintEntrance,
  paintRecede,
  pinningSuits,
  resetScene,
  segmentLengthPx,
  segmentStartPx,
  trackHeightVh,
  type SceneRegistration,
  type StageApi,
} from './stageContext'

/* ─────────────────────────────────────────────────────────
 * SCROLL STAGE
 *
 * One pinned viewport holds every scene as a stacked layer. Scrolling does not
 * move the page — it drives each layer's entrance directly, so scroll distance
 * and animation progress are the same quantity (a "scrub").
 *
 * A scene enters by un-clipping upward from the bottom edge as an inset card,
 * then expands to full bleed. The layer beneath recedes and dims, which reads
 * as depth rather than as a page change.
 *
 * Below `md`, or under reduced-motion, none of this runs: scenes render as
 * ordinary stacked sections. Mobile is excluded on purpose — browser chrome
 * resizes the viewport mid-scroll, which makes pinned layers jump.
 * ───────────────────────────────────────────────────────── */

export function ScrollStage({
  children,
  apiRef,
}: {
  children: ReactNode
  /** Lets chrome outside the stage (the header nav) jump to a scene. */
  apiRef?: RefObject<StageApi | null>
}): ReactElement {
  const trackRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const scenes = useRef(new Map<number, SceneRegistration>())
  const listeners = useRef(new Map<number, Set<(progress: number) => void>>())
  const [pinned, setPinned] = useState(pinningSuits)
  /** Mirrors each scene's `length` so geometry is available during render. */
  const [lengths, setLengths] = useState<Record<number, number>>({})

  const sceneCount = Children.count(children)

  useEffect(() => {
    const query = window.matchMedia(
      '(min-width: 768px) and (prefers-reduced-motion: no-preference)',
    )
    const sync = (): void => setPinned(query.matches)
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  const register = useCallback((index: number, registration: SceneRegistration) => {
    scenes.current.set(index, registration)
    setLengths((current) => ({ ...current, [index]: registration.length }))
    return () => {
      scenes.current.delete(index)
      // `lengths` keeps the entry: geometry only ever reads indices below the
      // current scene count, and a remount at the same index overwrites it.
    }
  }, [])

  const subscribe = useCallback((index: number, listener: (progress: number) => void) => {
    const set = listeners.current.get(index) ?? new Set()
    set.add(listener)
    listeners.current.set(index, set)
    return () => {
      set.delete(listener)
    }
  }, [])

  const scrollToScene = useCallback(
    (index: number) => {
      const track = trackRef.current
      const scene = scenes.current.get(index)
      if (!track || !pinned) {
        scene?.element.scrollIntoView({ behavior: 'smooth' })
        return
      }
      const offset =
        index === 0 ? 0 : segmentStartPx(lengths, index) + segmentLengthPx(lengths, index)
      window.scrollTo({ top: track.offsetTop + offset, behavior: 'smooth' })
    },
    [lengths, pinned],
  )

  useEffect(() => {
    const registry = scenes.current
    if (!pinned) {
      registry.forEach(resetScene)
      return
    }
    const track = trackRef.current
    const viewport = viewportRef.current
    if (!track || !viewport || registry.size === 0) return

    let context: gsap.Context | undefined
    let cancelled = false

    // ScrollTrigger measures the document when a trigger is created, and the
    // welcome intro holds the page unscrollable while it plays.
    void whenIntroSettled().then(() => {
      if (cancelled) return

      context = gsap.context(() => {
        ScrollTrigger.create({
          trigger: track,
          start: 'top top',
          end: 'bottom bottom',
          pin: viewport,
          pinSpacing: false,
          anticipatePin: 1,
        })

        registry.forEach((scene, index) => {
          if (index === 0) {
            scene.element.style.clipPath = 'inset(0px round 0px)'
            return
          }
          const previous = registry.get(index - 1)
          const apply = (progress: number): void => {
            paintEntrance(scene, progress)
            if (previous) paintRecede(previous, progress)
            const dwell = dwellProgress(scene, progress)
            listeners.current.get(index)?.forEach((listener) => listener(dwell))
          }

          // Painting straight from the trigger, rather than scrubbing a tween,
          // keeps scroll position and painted state the same quantity: there is
          // no interpolation frame to wait for, so the panel cannot lag behind
          // the wheel — and it stays correct when rAF is throttled.
          ScrollTrigger.create({
            trigger: track,
            start: () => `top+=${segmentStartPx(lengths, index)} top`,
            end: () =>
              `top+=${segmentStartPx(lengths, index) + segmentLengthPx(lengths, index)} top`,
            invalidateOnRefresh: true,
            onUpdate: (self) => apply(self.progress),
            onRefresh: (self) => apply(self.progress),
            onLeave: () => apply(1),
            onLeaveBack: () => apply(0),
          })

          apply(0)
        })
      }, track)

      ScrollTrigger.refresh()
    })

    return () => {
      cancelled = true
      context?.revert()
      registry.forEach(resetScene)
    }
  }, [lengths, pinned])

  const api = useMemo<StageApi>(
    () => ({ pinned, register, subscribe, scrollToScene }),
    [pinned, register, subscribe, scrollToScene],
  )

  useEffect(() => {
    if (!apiRef) return
    apiRef.current = api
    return () => {
      apiRef.current = null
    }
  }, [api, apiRef])

  const indexed = useMemo(
    () =>
      Children.map(children, (child, index) => (
        <SceneIndexContext.Provider value={index}>{child}</SceneIndexContext.Provider>
      )),
    [children],
  )

  if (!pinned) {
    return <StageContext.Provider value={api}>{indexed}</StageContext.Provider>
  }

  return (
    <StageContext.Provider value={api}>
      <div ref={trackRef} style={{ height: `${trackHeightVh(lengths, sceneCount)}vh` }}>
        <div ref={viewportRef} className="relative h-[100svh] overflow-hidden bg-neutral-950">
          {indexed}
        </div>
      </div>
    </StageContext.Provider>
  )
}

export { SCENE_LENGTH_VH }
