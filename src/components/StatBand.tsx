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
 * The figures that ride inside the opening band. They sit on one vertical
 * strip and roll: the outgoing figure leaves upward as the next arrives from
 * below, so a change reads as one movement rather than a cross-fade.
 *
 * Every figure stays in the DOM and the list is a `<dl>`, so a screen reader
 * gets all of them regardless of which one is currently on screen.
 */
export function StatBand({
  stats,
  active,
  hidden = false,
}: {
  stats: Stat[]
  active: number
  hidden?: boolean
}): ReactElement {
  return (
    <dl
      className={`grid transition-opacity duration-300 ${hidden ? 'opacity-0' : 'opacity-100'}`}
    >
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className="col-start-1 row-start-1 text-center transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
          style={{
            transform: `translateY(${(index - active) * 115}%)`,
            opacity: index === active ? 1 : 0,
          }}
          aria-hidden={index === active ? undefined : true}
        >
          <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-400">
            {stat.note}
          </dt>
          <dd className="mt-3 text-[clamp(3.5rem,8vw,7rem)] font-medium leading-[0.9] tracking-[-0.05em] tabular-nums text-neutral-50">
            {stat.value}
          </dd>
          <dd className="mt-3 text-[clamp(1rem,1.8vw,1.6rem)] tracking-[-0.02em] text-accent-300">
            {stat.label}
          </dd>
        </div>
      ))}
    </dl>
  )
}
