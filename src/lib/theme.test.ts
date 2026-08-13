import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))
  if (!match) throw new Error(`Theme selector not found: ${selector}`)
  return match[1]
}

function rgb(source: string, variable: string): [number, number, number] {
  const matches = [
    ...source.matchAll(new RegExp(`${variable}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`, 'g')),
  ]
  const match = matches.at(-1)
  if (!match) throw new Error(`Theme variable not found: ${variable}`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function luminance([r, g, b]: [number, number, number]): number {
  const [red, green, blue] = [r, g, b].map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const first = luminance(a)
  const second = luminance(b)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

/*
 * Contrast alone cannot answer "can a reader tell these two marks apart" — a
 * teal and an olive can sit at the same luminance and still be obviously
 * different colours, which is exactly the case the figure tones have to hold
 * against the status ones. OKLab is perceptually uniform, so a distance and a
 * hue angle in it mean what they look like.
 */
function oklab([r, g, b]: [number, number, number]): [number, number, number] {
  const [red, green, blue] = [r, g, b].map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function perceptualDistance(a: [number, number, number], b: [number, number, number]): number {
  const [first, second] = [oklab(a), oklab(b)]
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2])
}

function hueSeparation(a: [number, number, number], b: [number, number, number]): number {
  const angle = ([, x, y]: [number, number, number]): number =>
    ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
  const delta = Math.abs(angle(oklab(a)) - angle(oklab(b)))
  return Math.min(delta, 360 - delta)
}

describe('app theme contrast', () => {
  const dark = declarations(':root')
  const light = `${dark}\n${declarations(".surface-app[data-theme='light']")}`
  const site = `${dark}\n${declarations('.surface-site')}`

  it.each([
    ['dark primary text', dark, '--neutral-100', '--neutral-950', 4.5],
    ['dark secondary text', dark, '--neutral-400', '--neutral-950', 4.5],
    ['dark focus ring on card', dark, '--accent-300', '--neutral-900', 3],
    ['dark control boundary on card', dark, '--boundary', '--neutral-900', 3],
    ['dark muted text', dark, '--neutral-500', '--neutral-900', 4.5],
    ['dark quiet text', dark, '--neutral-600', '--neutral-900', 4.5],
    ['dark validation text', dark, '--negative-300', '--neutral-950', 4.5],
    ['light primary text', light, '--neutral-50', '--neutral-950', 4.5],
    ['light secondary text', light, '--neutral-400', '--neutral-950', 4.5],
    ['light focus ring', light, '--accent-400', '--neutral-950', 3],
    ['light control boundary', light, '--boundary', '--neutral-950', 3],
    ['light success text', light, '--positive-100', '--neutral-900', 4.5],
    ['light warning text', light, '--warning-100', '--neutral-900', 4.5],
    ['light danger text', light, '--negative-100', '--neutral-900', 4.5],
    ['site muted text on paper', site, '--neutral-600', '--neutral-50', 4.5],
    ['site muted text on pale card', site, '--neutral-600', '--neutral-200', 4.5],
    ['site control boundary', site, '--boundary', '--neutral-50', 3],
  ])('%s passes its minimum ratio', (_label, source, foreground, background, minimum) => {
    expect(contrast(rgb(source, foreground), rgb(source, background))).toBeGreaterThanOrEqual(
      minimum,
    )
  })

  it('keeps cream text readable on the Everspan ember action', () => {
    expect(contrast(rgb(dark, '--on-accent'), rgb(dark, '--accent-500'))).toBeGreaterThanOrEqual(
      4.5,
    )
  })

  /*
   * The status roles used to be required to equal the brand, because the brand
   * was blue and spending a second hue on meaning would have broken a
   * single-colour identity. An ember brand inverts that: a failure painted in
   * the brand red cannot be told apart from a primary button, so success and
   * warning now carry the olive and the terracotta. These two tests are what
   * stop them quietly collapsing back onto the accent in a future palette pass.
   */
  it.each([
    ['positive', 'dark'],
    ['warning', 'dark'],
    ['negative', 'dark'],
  ])('%s status text is readable on the %s card', (role) => {
    expect(contrast(rgb(dark, `--${role}-300`), rgb(dark, '--neutral-900'))).toBeGreaterThanOrEqual(
      4.5,
    )
    expect(
      contrast(rgb(light, `--${role}-100`), rgb(light, '--neutral-900')),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it.each([
    ['success', 'positive'],
    ['warning', 'warning'],
  ])('%s stays distinguishable from the brand ember', (_label, role) => {
    for (const source of [dark, light]) {
      expect(rgb(source, `--${role}-400`)).not.toEqual(rgb(source, '--accent-400'))
      expect(rgb(source, `--${role}-500`)).not.toEqual(rgb(source, '--accent-500'))
    }
  })

  it('keeps failure on the ember, where red is also the meaning', () => {
    expect(rgb(dark, '--negative-500')).toEqual(rgb(dark, '--accent-500'))
  })
})

/*
 * The figure tones give a concept icon its own identity colour. They earn a
 * test of their own because they are the one place the app spends more than one
 * hue, and the whole argument for doing so collapses if they either blur into
 * each other or start reading as status.
 */
describe('figure tones', () => {
  const dark = declarations(':root')
  const light = `${dark}\n${declarations(".surface-app[data-theme='light']")}`
  const site = `${dark}\n${declarations('.surface-site')}`
  const TONES = ['ember', 'ochre', 'verdigris', 'mulberry'] as const

  it.each([
    ['dark', dark, '--neutral-900'],
    ['light', light, '--neutral-900'],
    ['site', site, '--neutral-50'],
  ])('every tone stays readable on the %s card', (_surface, source, background) => {
    for (const tone of TONES) {
      /* Held to the text bar rather than the 3:1 graphics one: these marks
         carry the meaning of the row they sit in, not just its shape. */
      expect(contrast(rgb(source, `--figure-${tone}`), rgb(source, background))).toBeGreaterThan(4.5)
    }
  })

  it.each([
    ['dark', dark],
    ['light', light],
  ])('tones stay tellable apart from each other on the %s surface', (_surface, source) => {
    for (let i = 0; i < TONES.length; i += 1) {
      for (let j = i + 1; j < TONES.length; j += 1) {
        expect(
          perceptualDistance(rgb(source, `--figure-${TONES[i]}`), rgb(source, `--figure-${TONES[j]}`)),
        ).toBeGreaterThan(0.1)
      }
    }
  })

  /*
   * Ember is exempt: it *is* the brand red, and the brand red is also failure.
   * A split or a swap mark in the accent is the app naming itself, not raising
   * an error — the three status roles keep their own surfaces and copy.
   */
  it.each([
    ['dark', dark],
    ['light', light],
  ])('no tone but ember drifts onto a status hue on the %s surface', (_surface, source) => {
    for (const tone of TONES.filter((name) => name !== 'ember')) {
      for (const role of ['positive', 'warning', 'negative']) {
        expect(
          hueSeparation(rgb(source, `--figure-${tone}`), rgb(source, `--${role}-300`)),
        ).toBeGreaterThan(25)
      }
    }
  })

  it('carries the paper-tuned tones into the marketing route and back out on ink', () => {
    const ink = declarations('.surface-ink')
    for (const tone of TONES) {
      expect(rgb(site, `--figure-${tone}`)).toEqual(rgb(light, `--figure-${tone}`))
      expect(rgb(ink, `--figure-${tone}`)).toEqual(rgb(dark, `--figure-${tone}`))
    }
  })
})
