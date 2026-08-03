import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/**
 * Sole point of contact with GSAP, mirroring how `wallet.ts` wraps the wallet
 * kit: components import from here, never from `gsap` directly. Registering the
 * plugin in a module body guarantees it happens exactly once, before any
 * component tries to build a ScrollTrigger.
 */
gsap.registerPlugin(ScrollTrigger)

export { gsap, ScrollTrigger }

/**
 * The landing intro locks scrolling (`body { overflow: hidden }`) and marks
 * `#landing-content` inert while it plays. ScrollTrigger measures the document
 * when it is created, so a trigger built during those ~2.3s reads a page that
 * cannot scroll and pins at the wrong offsets.
 *
 * Rather than reach into `WelcomeIntro`, watch for the `inert` attribute it
 * removes on completion. Resolves immediately when no intro is playing.
 */
export function whenIntroSettled(): Promise<void> {
  const content = document.getElementById('landing-content')
  if (!content?.hasAttribute('inert')) return Promise.resolve()

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (content.hasAttribute('inert')) return
      observer.disconnect()
      resolve()
    })
    observer.observe(content, { attributeFilter: ['inert'] })
  })
}
