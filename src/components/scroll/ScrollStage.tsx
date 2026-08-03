import {
  Children,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { gsap, ScrollTrigger, whenIntroSettled } from '../../lib/gsap'
import {
  SCENE_LENGTH_VH,
  SceneIndexContext,
  StageContext,
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

export function ScrollStage({ children }: { children: ReactNode }): ReactElement {
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
          const proxy = { progress: 0 }

          gsap.to(proxy, {
            progress: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: track,
              start: () => `top+=${segmentStartPx(lengths, index)} top`,
              end: () =>
                `top+=${segmentStartPx(lengths, index) + segmentLengthPx(lengths, index)} top`,
              scrub: true,
              invalidateOnRefresh: true,
            },
            onUpdate: () => {
              paintEntrance(scene, proxy.progress)
              if (previous) paintRecede(previous, proxy.progress)
              listeners.current.get(index)?.forEach((listener) => listener(proxy.progress))
            },
          })

          paintEntrance(scene, 0)
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
