import type { ReactElement } from 'react'

export type Stat = {
  /** The figure itself, already formatted. */
  value: string
  /** What the figure counts. */
  label: string
  /** Where it comes from, e.g. "ON CHAIN". */
  note: string
}

/**
 * Each strip is its own roller, and each one starts a beat after the strip
 * above it. A single shared movement reads as one card being swapped; three
 * offset ones read as the figure pushing the next figure up out of the way,
 * which is what a change of state actually is here.
 */
const ROLL_DELAY_MS = [0, 70, 140]

/**
 * The figures that ride inside the opening band. They sit on one vertical
 * strip and roll: the outgoing figure leaves upward as the next arrives from
 * below, clipped at the edge of its own line rather than fading out.
 *
 * The rollers are decorative duplicates of one list, so they are hidden from
 * assistive tech and the full set is published once as a plain `<dl>`.
 */
export function StatBand({ stats, active }: { stats: Stat[]; active: number }): ReactElement {
  return (
    <>
      <div className="grid justify-items-center gap-3 text-center" aria-hidden="true">
        <Roller
          items={stats.map((stat) => stat.note)}
          active={active}
          delayMs={ROLL_DELAY_MS[0]}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-400"
        />
        <Roller
          items={stats.map((stat) => stat.value)}
          active={active}
          delayMs={ROLL_DELAY_MS[1]}
          className="text-[clamp(3.5rem,8vw,7rem)] font-medium leading-[0.9] tracking-[-0.05em] tabular-nums text-neutral-50"
        />
        <Roller
          items={stats.map((stat) => stat.label)}
          active={active}
          delayMs={ROLL_DELAY_MS[2]}
          className="text-[clamp(1.15rem,2.1vw,1.9rem)] leading-[1.15] tracking-[-0.02em] text-accent-300"
        />
      </div>

      <dl className="sr-only">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt>{`${stat.label} (${stat.note})`}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}

/**
 * One line of type on a vertical belt. Every entry occupies the same grid cell
 * and the belt is offset by whole lines, so the box only ever shows the active
 * one — the neighbours are clipped away at its top and bottom edges.
 */
function Roller({
  items,
  active,
  delayMs,
  className,
}: {
  items: string[]
  active: number
  delayMs: number
  className: string
}): ReactElement {
  return (
    // The padding keeps descenders off the clip edge; the belt steps by more
    // than a full line so the neighbours clear that padding too.
    <div className="grid overflow-hidden px-1 py-[0.1em]">
      {items.map((item, index) => (
        <span
          key={index}
          className={`col-start-1 row-start-1 block w-full transition-transform duration-[620ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${className}`}
          style={{
            transform: `translateY(${(index - active) * 118}%)`,
            transitionDelay: `${delayMs}ms`,
          }}
        >
          {item}
        </span>
      ))}
    </div>
  )
}
