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
export function paintEntrance(scene: SceneRegistration, progress: number): void {
  const reveal = clamp01(progress / REVEAL_SPLIT)
  const expand = clamp01((progress - REVEAL_SPLIT) / (1 - REVEAL_SPLIT))
  const gutter = GUTTER_PX * (1 - expand)
  const radius = RADIUS_PX * (1 - expand)

  scene.element.style.clipPath = `inset(${(1 - reveal) * 100}% ${gutter}px ${gutter}px ${gutter}px round ${radius}px)`
  scene.content.style.transform = `translate3d(0, ${CONTENT_RISE_PX * (1 - clamp01(progress / 0.8))}px, 0)`
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
  scene.dim.style.opacity = '0'
}

export function useStage(): StageApi | null {
  return useContext(StageContext)
}

export function useSceneIndex(): number {
  return useContext(SceneIndexContext)
}

/**
 * Subscribes to this scene's entrance progress (0 → 1). The listener runs on
 * every scroll frame, so it should write to the DOM directly rather than call
 * `setState`. For discrete state, use `useSceneStep`.
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
 * Buckets this scene's entrance progress into `count` steps, re-rendering only
 * when the bucket changes. `from` skips the part of the entrance spent wiping
 * in, so steps advance once the scene is actually on screen.
 */
export function useSceneStep(count: number, from = 0.35): number {
  const [step, setStep] = useState(0)

  useSceneProgress((progress) => {
    const span = clamp01((progress - from) / (1 - from))
    setStep(Math.min(count - 1, Math.floor(span * count)))
  })

  return step
}
