import type { ReactElement } from 'react'
import { ChartBarIcon, LockIcon, SplitIcon } from './icons'
import { FIGURE_TONE, figureText } from '../lib/figures'
import { useSceneStep, useStage } from './scroll/stageContext'

const JOURNEY_STEPS = [
  {
    eyebrow: '01 · STANDARDIZE',
    title: 'Start with yield.',
    body: 'A yield-bearing asset enters Everspan as Standardized Yield. One interface keeps the rate readable across every maturity.',
    icon: <ChartBarIcon className={`h-5 w-5 ${figureText(FIGURE_TONE.yield)}`} />,
  },
  {
    eyebrow: '02 · SEPARATE',
    title: 'Split one position into two.',
    body: 'Every SY creates equal amounts of PT and YT. Principal and yield become independent, transferable positions.',
    icon: <SplitIcon className={`h-5 w-5 ${figureText(FIGURE_TONE.split)}`} />,
  },
  {
    eyebrow: '03 · CHOOSE',
    title: 'Hold the exposure you want.',
    body: 'Buy discounted PT for a maturity-based rate. Hold YT for the yield released before maturity. Trade or provide liquidity at any time.',
    icon: <LockIcon className={`h-5 w-5 ${figureText(FIGURE_TONE.fixed)}`} />,
  },
] as const

/**
 * The three-step story of a position. Inside a pinned `ScrollScene` the steps
 * are driven by scroll progress and the copy cross-fades in place; in the
 * stacked fallback every step is listed and the diagram shows its end state.
 */
export function YieldJourney(): ReactElement {
  const pinned = useStage()?.pinned ?? false
  const scrubbedStep = useSceneStep(JOURNEY_STEPS.length)
  const activeStep = pinned ? scrubbedStep : JOURNEY_STEPS.length - 1

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:gap-20 lg:px-10">
      <JourneyVisual activeStep={activeStep} />

      {pinned ? (
        <div className="grid items-center">
          {JOURNEY_STEPS.map((step, index) => (
            <div
              key={step.eyebrow}
              className={`col-start-1 row-start-1 transition-opacity duration-300 ${
                activeStep === index ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <JourneyCopy step={step} isActive={activeStep === index} />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col justify-center gap-14">
          {JOURNEY_STEPS.map((step) => (
            <JourneyCopy key={step.eyebrow} step={step} isActive />
          ))}
        </div>
      )}
    </div>
  )
}

function JourneyCopy({
  step,
  isActive,
}: {
  step: (typeof JOURNEY_STEPS)[number]
  isActive: boolean
}): ReactElement {
  return (
    <div className={`journey-copy ${isActive ? 'is-active' : ''}`}>
      <div className="flex items-center justify-between gap-6 text-neutral-400">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em]">{step.eyebrow}</p>
        <span aria-hidden="true">{step.icon}</span>
      </div>
      <h3 className="mt-6 text-[clamp(2.25rem,4.6vw,4.25rem)] font-medium leading-[0.9] tracking-[-0.055em]">
        {step.title}
      </h3>
      <p className="mt-6 max-w-lg text-lg leading-relaxed text-neutral-300">{step.body}</p>
    </div>
  )
}

function JourneyVisual({ activeStep }: { activeStep: number }): ReactElement {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto aspect-square w-full max-w-md self-center overflow-hidden rounded-3xl border border-neutral-50/15 bg-neutral-900 p-5 sm:p-8 lg:mx-0"
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
            <ChartBarIcon className={`h-8 w-8 ${figureText(FIGURE_TONE.yield)}`} />
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
    <div className={`flex min-h-40 flex-col rounded-2xl p-5 pb-14 sm:min-h-48 sm:p-6 ${className}`}>
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-90">{label}</p>
      <p className="mt-auto text-2xl font-medium tracking-[-0.04em] tabular-nums sm:text-3xl">
        {amount}
      </p>
      <p className="mt-1 text-xs opacity-90">{note}</p>
    </div>
  )
}
