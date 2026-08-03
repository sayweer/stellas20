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

/** Where in a scene's segment the nav lands: past the entrance, inside dwell. */
const SCENE_TARGET = 0.82

/*
 * Note on smoothing: a wheel delivers scroll in coarse notches, so a scrub
 * painted straight from the scroll position can look stepped. Easing the paint
 * behind the scroll was tried twice — with ScrollTrigger's own `scrub`, which
 * completes in a single tick here whatever value it is given, and with a
 * hand-rolled follow on `gsap.ticker`, which ended up with two loops painting
 * conflicting values. Both looked worse than painting directly, so the paint
 * tracks the scroll exactly and the shorter track carries the smoothness.
 */

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
      // Land inside the scene's dwell rather than at the end of its segment,
      // which is the instant before the next scene starts covering it.
      const offset =
        index === 0
          ? 0
          : segmentStartPx(lengths, index) + segmentLengthPx(lengths, index) * SCENE_TARGET
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
          if (index === 0 && !scene.custom) {
            scene.element.style.clipPath = 'inset(0px round 0px)'
            return
          }
          const previous = index === 0 ? undefined : registry.get(index - 1)
          const apply = (progress: number): void => {
            if (scene.custom) {
              // The scene owns its own look; it gets raw progress so it can
              // lay out its phases without the entrance/dwell split.
              scene.element.style.clipPath = 'inset(0px round 0px)'
              listeners.current.get(index)?.forEach((listener) => listener(progress))
              return
            }
            paintEntrance(scene, progress)
            if (previous) paintRecede(previous, progress)
            const dwell = dwellProgress(scene, progress)
            listeners.current.get(index)?.forEach((listener) => listener(dwell))
          }

          let painted = -1
          const paint = (value: number): void => {
            if (value === painted) return
            painted = value
            apply(value)
          }

          ScrollTrigger.create({
            trigger: track,
            start: () => `top+=${segmentStartPx(lengths, index)} top`,
            end: () =>
              `top+=${segmentStartPx(lengths, index) + segmentLengthPx(lengths, index)} top`,
            invalidateOnRefresh: true,
            onUpdate: (self) => paint(self.progress),
            onRefresh: (self) => paint(self.progress),
            onLeave: () => paint(1),
            onLeaveBack: () => paint(0),
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
