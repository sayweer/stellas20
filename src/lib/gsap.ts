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
