import { useEffect, useRef, useState, type ReactElement } from 'react'
import { ChartBarIcon, LockIcon, SplitIcon } from './icons'

const JOURNEY_STEPS = [
  {
    eyebrow: '01 · STANDARDIZE',
    title: 'Start with yield.',
    body: 'A yield-bearing asset enters Everspan as Standardized Yield. One interface keeps the rate readable across every maturity.',
    icon: <ChartBarIcon className="h-5 w-5" />,
  },
  {
    eyebrow: '02 · SEPARATE',
    title: 'Split one position into two.',
    body: 'Every SY creates equal amounts of PT and YT. Principal and yield become independent, transferable positions.',
    icon: <SplitIcon className="h-5 w-5" />,
  },
  {
    eyebrow: '03 · CHOOSE',
    title: 'Hold the exposure you want.',
    body: 'Buy discounted PT for a maturity-based rate. Hold YT for the yield released before maturity. Trade or provide liquidity at any time.',
    icon: <LockIcon className="h-5 w-5" />,
  },
] as const

export function YieldJourney(): ReactElement {
  const [activeStep, setActiveStep] = useState(0)
  const stepRefs = useRef<Array<HTMLElement | null>>([])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (!visibleEntry) return
        const index = Number((visibleEntry.target as HTMLElement).dataset.step)
        setActiveStep(index)
      },
      { threshold: [0.35, 0.55, 0.75], rootMargin: '-15% 0px -25% 0px' },
    )

    stepRefs.current.forEach((element) => {
      if (element) observer.observe(element)
    })
    return () => observer.disconnect()
  }, [])

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 sm:gap-12 sm:px-8 md:grid-cols-[1.02fr_0.98fr] md:gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:gap-20 lg:px-10">
      <div className="relative z-10 flex items-center bg-neutral-950 py-4 sm:py-0 md:sticky md:top-20 md:h-[calc(100svh-5rem)]">
        <JourneyVisual activeStep={activeStep} />
      </div>

      <div>
        {JOURNEY_STEPS.map((step, index) => (
          <article
            key={step.eyebrow}
            ref={(element) => {
              stepRefs.current[index] = element
            }}
            data-step={index}
            className="flex items-center border-b border-neutral-50/15 py-20 last:border-b-0 sm:min-h-[72svh] md:min-h-[88svh]"
          >
            <div className={`journey-copy ${activeStep === index ? 'is-active' : ''}`}>
              <div className="flex items-center justify-between gap-6 text-neutral-400">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em]">{step.eyebrow}</p>
                <span aria-hidden="true">{step.icon}</span>
              </div>
              <h3 className="mt-8 text-[clamp(2.75rem,6vw,5.5rem)] font-medium leading-[0.9] tracking-[-0.055em]">
                {step.title}
              </h3>
              <p className="mt-7 max-w-lg text-lg leading-relaxed text-neutral-300">{step.body}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function JourneyVisual({ activeStep }: { activeStep: number }): ReactElement {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto aspect-square w-full max-w-xl overflow-hidden rounded-3xl border border-neutral-50/15 bg-neutral-900 p-5 sm:p-8 lg:mx-0"
    >
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-400">
        <span>Position architecture</span>
        <span>0{activeStep + 1} / 03</span>
      </div>

      <div className="absolute inset-x-5 bottom-5 top-16 sm:inset-x-8 sm:bottom-8 sm:top-20">
        <div className={`journey-source ${activeStep >= 1 ? 'is-separated' : ''}`}>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-400">
            Source
          </p>
          <p className="mt-4 text-5xl font-medium tracking-[-0.05em] tabular-nums sm:text-6xl">
            1,000
          </p>
          <div className="mt-auto flex items-end justify-between gap-4">
            <div>
              <p className="text-xl font-medium">SY</p>
              <p className="mt-1 text-xs text-neutral-400">Standardized Yield</p>
            </div>
            <ChartBarIcon className="h-8 w-8 text-accent-400" />
          </div>
        </div>

        <div className={`journey-positions ${activeStep >= 1 ? 'is-visible' : ''}`}>
          <PositionCard
            className="bg-neutral-50 text-neutral-950"
            label="PRINCIPAL TOKEN"
            amount="1,000 PT"
            note={activeStep >= 2 ? 'Redeem at maturity' : 'Principal separated'}
          />
          <PositionCard
            className="bg-accent-500 text-neutral-50"
            label="YIELD TOKEN"
            amount="1,000 YT"
            note={activeStep >= 2 ? 'Yield until maturity' : 'Yield separated'}
          />
        </div>

        <div className={`journey-choice ${activeStep >= 2 ? 'is-visible' : ''}`}>
          <span>FIXED RATE</span>
          <span>YIELD EXPOSURE</span>
        </div>
      </div>
    </div>
  )
}

function PositionCard({
  className,
  label,
  amount,
  note,
}: {
  className: string
  label: string
  amount: string
  note: string
}): ReactElement {
  return (
    <div
      className={`flex min-h-48 flex-col rounded-2xl p-5 pb-16 sm:min-h-56 sm:p-6 sm:pb-16 ${className}`}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-90">{label}</p>
      <p className="mt-auto text-2xl font-medium tracking-[-0.04em] tabular-nums sm:text-3xl">
        {amount}
      </p>
      <p className="mt-1 text-xs opacity-90">{note}</p>
    </div>
  )
}
