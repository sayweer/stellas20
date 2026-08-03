import { useRef, type ReactElement, type ReactNode } from 'react'
import { useSceneProgress } from './stageContext'

/**
 * Drifts its children against the scene's dwell, so a product visual reads as
 * sitting behind the copy rather than pasted onto it. Inert in the stacked
 * fallback, where `useSceneProgress` never fires.
 */
export function SceneParallax({
  children,
  distance = 44,
  className = '',
}: {
  children: ReactNode
  distance?: number
  className?: string
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  useSceneProgress((dwell) => {
    const element = ref.current
    if (element) element.style.transform = `translate3d(0, ${(0.5 - dwell) * distance}px, 0)`
  })

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
