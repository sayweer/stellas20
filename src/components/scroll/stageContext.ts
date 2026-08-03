import { createContext, useContext, useEffect, useRef, useState } from 'react'

/* ─────────────────────────────────────────────────────────
 * SCROLL STAGE — shared contract
 *
 * Context, geometry and paint helpers for `ScrollStage`/`ScrollScene`.
 * Kept out of the component files so both can import from one place without
 * breaking fast refresh.
 * ───────────────────────────────────────────────────────── */

/** Viewport heights of scroll before the first panel starts covering the hero. */
export const HERO_DWELL_VH = 0.5
/** Viewport heights of scroll one panel entrance consumes at `length={1}`. */
export const SCENE_LENGTH_VH = 1.6
/** Viewport heights the final panel holds before the stage unpins. */
export const TAIL_VH = 0.6

/** Fraction of a scene's entrance spent un-clipping, before it expands. */
const REVEAL_SPLIT = 0.72
const GUTTER_PX = 24
const RADIUS_PX = 20
/** How far the outgoing layer recedes while the next one covers it. */
const RECEDE_SCALE = 0.97
const RECEDE_DIM = 0.55
/** Distance a scene's content travels as it settles into place. */
const CONTENT_RISE_PX = 56
/**
 * Content waits for most of the wipe before appearing. Without this the
 * headline is sliced in half by the advancing edge and briefly collides with
 * the outgoing scene's headline behind it.
 */
const CONTENT_SETTLE_FROM = 0.3
const CONTENT_SETTLE_TO = 0.78

export type SceneRegistration = {
  element: HTMLElement
  content: HTMLElement
  dim: HTMLElement
  length: number
}

export type StageApi = {
  pinned: boolean
  register(index: number, registration: SceneRegistration): () => void
  subscribe(index: number, listener: (progress: number) => void): () => void
  scrollToScene(index: number): void
}

export const StageContext = createContext<StageApi | null>(null)
export const SceneIndexContext = createContext(0)

export function pinningSuits(): boolean {
  return window.matchMedia('(min-width: 768px) and (prefers-reduced-motion: no-preference)').matches
}

export function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/** Scroll offset, in pixels from the top of the track, where scene `index` begins entering. */
export function segmentStartPx(lengths: Record<number, number>, index: number): number {
  let vh = HERO_DWELL_VH
  for (let i = 1; i < index; i += 1) vh += (lengths[i] ?? 1) * SCENE_LENGTH_VH
  return vh * window.innerHeight
}

export function segmentLengthPx(lengths: Record<number, number>, index: number): number {
  return (lengths[index] ?? 1) * SCENE_LENGTH_VH * window.innerHeight
}

export function trackHeightVh(lengths: Record<number, number>, sceneCount: number): number {
  let vh = HERO_DWELL_VH + TAIL_VH
  for (let index = 1; index < sceneCount; index += 1) vh += (lengths[index] ?? 1) * SCENE_LENGTH_VH
  return vh * 100
}

/**
 * Paints one layer for a given entrance progress. Called from a scrubbed tween,
 * so it runs on every scroll frame and must only touch compositor-friendly
 * properties (`clip-path`, `transform`, `opacity`).
 */
export function paintEntrance(scene: SceneRegistration, rawProgress: number): void {
  // A scene's entrance always costs the same scroll distance; a `length` above
  // 1 buys dwell time on the far side, not a slower wipe.
  const progress = clamp01(rawProgress * Math.max(1, scene.length))
  const reveal = clamp01(progress / REVEAL_SPLIT)
  const expand = clamp01((progress - REVEAL_SPLIT) / (1 - REVEAL_SPLIT))
  const gutter = GUTTER_PX * (1 - expand)
  const radius = RADIUS_PX * (1 - expand)

  scene.element.style.clipPath = `inset(${(1 - reveal) * 100}% ${gutter}px ${gutter}px ${gutter}px round ${radius}px)`

  const settle = clamp01(
    (progress - CONTENT_SETTLE_FROM) / (CONTENT_SETTLE_TO - CONTENT_SETTLE_FROM),
  )
  scene.content.style.opacity = String(settle)
  scene.content.style.transform = `translate3d(0, ${CONTENT_RISE_PX * (1 - settle)}px, 0)`
}

/**
 * How far a scene is through its dwell — the scroll it holds after its entrance
 * finishes. Always 0 while the scene is still wiping in, so multi-step visuals
 * start from the beginning once the scene is actually on screen.
 */
export function dwellProgress(scene: SceneRegistration, rawProgress: number): number {
  const entrance = 1 / Math.max(1, scene.length)
  if (entrance >= 1) return rawProgress
  return clamp01((rawProgress - entrance) / (1 - entrance))
}

/** Paints the layer being covered: it settles back instead of sitting flat. */
export function paintRecede(scene: SceneRegistration, progress: number): void {
  scene.element.style.transform = `scale(${1 - (1 - RECEDE_SCALE) * progress})`
  scene.dim.style.opacity = String(RECEDE_DIM * progress)
}

export function resetScene(scene: SceneRegistration): void {
  scene.element.style.clipPath = ''
  scene.element.style.transform = ''
  scene.content.style.transform = ''
  scene.content.style.opacity = ''
  scene.dim.style.opacity = '0'
}

export function useStage(): StageApi | null {
  return useContext(StageContext)
}

export function useSceneIndex(): number {
  return useContext(SceneIndexContext)
}

/**
 * Subscribes to this scene's dwell progress (0 → 1, see `dwellProgress`). The
 * listener runs on every scroll frame, so it should write to the DOM directly
 * rather than call `setState`. For discrete state, use `useSceneStep`.
 */
export function useSceneProgress(listener: (progress: number) => void): void {
  const stage = useStage()
  const index = useSceneIndex()
  const stable = useRef(listener)

  useEffect(() => {
    stable.current = listener
  })

  useEffect(() => {
    if (!stage?.pinned) return
    return stage.subscribe(index, (progress) => stable.current(progress))
  }, [index, stage])
}

/**
 * Buckets this scene's dwell into `count` steps, re-rendering only when the
 * bucket changes. Give such a scene a `length` above 1 so each step gets a
 * comfortable amount of scroll.
 */
export function useSceneStep(count: number): number {
  const [step, setStep] = useState(0)

  useSceneProgress((dwell) => {
    setStep(Math.min(count - 1, Math.floor(dwell * count)))
  })

  return step
}
