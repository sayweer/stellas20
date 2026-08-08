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
 * The figures that ride inside the opening band. Each line sits on its own
 * vertical belt: the outgoing figure leaves upward as the next arrives from
 * below, clipped at the edge of its own line rather than fading out.
 *
 * Nothing here animates on its own. Every belt is placed from a custom
 * property that `OpeningScene` writes straight from the scroll position, so a
 * change plays out at exactly the pace the reader scrolls and stops the moment
 * they do. The three properties move at slightly different points, which is
 * what makes the lines push each other out rather than slide as one block.
 *
 * The belts are decorative duplicates of one list, so they are hidden from
 * assistive tech and the full set is published once as a plain `<dl>`.
 */
export function StatBand({ stats }: { stats: Stat[] }): ReactElement {
  return (
    <>
      <div className="grid justify-items-center gap-3 text-center" aria-hidden="true">
        <Belt
          items={stats.map((stat) => stat.note)}
          positionVar="--stat-note"
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-400"
        />
        <Belt
          items={stats.map((stat) => stat.value)}
          positionVar="--stat-value"
          className="text-[clamp(3.5rem,8vw,7rem)] font-medium leading-[0.9] tracking-[-0.05em] tabular-nums text-neutral-50"
        />
        <Belt
          items={stats.map((stat) => stat.label)}
          positionVar="--stat-label"
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
 * and is offset by its distance from the belt's current position, so the box
 * only ever shows the entry that position lands on — its neighbours are
 * clipped away at the top and bottom edges.
 */
function Belt({
  items,
  positionVar,
  className,
}: {
  items: string[]
  /** Custom property holding the fractional index the belt rests at. */
  positionVar: string
  className: string
}): ReactElement {
  return (
    // The breathing room belongs to the entry, not the box: the belt steps by
    // exactly one entry height, so padding on the box would make the step
    // shorter than the window and leave two lines overlapping mid-push.
    <div className="grid overflow-hidden">
      {items.map((item, index) => (
        <span
          key={index}
          className={`col-start-1 row-start-1 block w-full px-1 py-[0.12em] ${className}`}
          style={{ transform: `translateY(calc((${index} - var(${positionVar}, 0)) * 100%))` }}
        >
          {item}
        </span>
      ))}
    </div>
  )
}
