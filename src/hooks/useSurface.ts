import { useEffect } from 'react'

export type Surface = 'site' | 'app'

/**
 * Spelled out rather than built with a template literal: the rules live in
 * `@layer base`, and Tailwind only keeps a layered rule if it finds the literal
 * class name while scanning source files. `surface-${surface}` scans as nothing
 * and the declarations get dropped from the bundle.
 */
const SURFACE_CLASS: Record<Surface, string> = {
  site: 'surface-site',
  app: 'surface-app',
}

/**
 * Paints the document root for the active route.
 *
 * The marketing route is light and the app is dark, so the background cannot
 * live on a single `html` rule. It has to sit on the root element rather than
 * a page wrapper: anything lower leaves the overscroll area (rubber-banding on
 * macOS/iOS) showing the other surface's colour.
 */
export function useSurface(surface: Surface): void {
  useEffect(() => {
    const root = document.documentElement
    const className = SURFACE_CLASS[surface]
    root.classList.add(className)
    return () => root.classList.remove(className)
  }, [surface])
}
