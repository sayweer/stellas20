/** Identity tones for concept icons — the four defined in `src/index.css`. */
export type FigureTone = 'ember' | 'ochre' | 'verdigris' | 'mulberry'

/*
 * Each concept owns one tone, fixed here instead of at the call site. A lock is
 * the same colour in the overview, in the trade panel and on the marketing
 * route, so the colour becomes something the reader can learn. Letting each
 * component pick is how every mark ended up the same muted brown to begin with.
 *
 * The grouping is by what the reader is being told, not by glyph: yield and
 * value are both "this is money moving", and the ember is kept for the one act
 * the protocol performs on a position.
 *
 * Two kinds of mark stay out of this and keep inheriting the text around them.
 * The countdown clocks are the unit of the number beside them, not a sign of
 * their own, and colouring one pulls the eye off the rate it is annotating. The
 * nav icons already carry state through selection, and a second signal there
 * would compete with it. The swap arrow between the PT and SY tiles on the
 * marketing route is a connector, and painting it the ember put a second brand
 * red beside the one the SY tile already spends.
 */
export const FIGURE_TONE = {
  fixed: 'mulberry',
  yield: 'ochre',
  value: 'ochre',
  balance: 'ochre',
  liquidity: 'verdigris',
  markets: 'verdigris',
  split: 'ember',
} as const satisfies Record<string, FigureTone>

const TEXT: Record<FigureTone, string> = {
  ember: 'text-figure-ember',
  ochre: 'text-figure-ochre',
  verdigris: 'text-figure-verdigris',
  mulberry: 'text-figure-mulberry',
}

/** For a mark that sits inline in a row, with no tile of its own to fill. */
export function figureText(tone: FigureTone): string {
  return TEXT[tone]
}

/*
 * Tiles are written out per tone rather than composed from an interpolated
 * class, because Tailwind only ships the class names it can find as literals in
 * the source.
 */
export const FIGURE_TILE: Record<FigureTone, string> = {
  ember:
    'bg-figure-ember/[0.12] text-figure-ember ring-figure-ember/25 group-hover:bg-figure-ember/20',
  ochre:
    'bg-figure-ochre/[0.12] text-figure-ochre ring-figure-ochre/25 group-hover:bg-figure-ochre/20',
  verdigris:
    'bg-figure-verdigris/[0.12] text-figure-verdigris ring-figure-verdigris/25 group-hover:bg-figure-verdigris/20',
  mulberry:
    'bg-figure-mulberry/[0.12] text-figure-mulberry ring-figure-mulberry/25 group-hover:bg-figure-mulberry/20',
}
