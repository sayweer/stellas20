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

describe('app theme contrast', () => {
  const dark = declarations(':root')
  const light = `${dark}\n${declarations(".surface-app[data-theme='light']")}`

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
  ])('%s passes its minimum ratio', (_label, source, foreground, background, minimum) => {
    expect(contrast(rgb(source, foreground), rgb(source, background))).toBeGreaterThanOrEqual(
      minimum,
    )
  })

  it('keeps cream text readable on the Everspan red action', () => {
    expect(contrast(rgb(dark, '--on-accent'), rgb(dark, '--accent-500'))).toBeGreaterThanOrEqual(
      4.5,
    )
  })

  it.each(['positive', 'negative', 'warning'])('%s roles remain brand-red derived', (role) => {
    expect(rgb(dark, `--${role}-500`)).toEqual(rgb(dark, '--accent-500'))
    expect(rgb(light, `--${role}-100`)).toEqual(rgb(light, '--accent-300'))
  })
})
