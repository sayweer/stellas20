/** Three-step getting-started guide shown until the user opens their first position. */
import type { ReactElement } from 'react'
import { activeMarket } from '../lib/market'
import { CheckIcon } from './icons'

interface OnboardingStepsProps {
  gotTokens: boolean
  wrapped: boolean
  split: boolean
}

interface Step {
  n: number
  title: string
  detail: string
  done: boolean
}

export function OnboardingSteps({ gotTokens, wrapped, split }: OnboardingStepsProps): ReactElement {
  const market = activeMarket()
  const steps: Step[] = [
    {
      n: 1,
      title: `Get ${market.underlyingSymbol}`,
      detail:
        market.source === 'mock'
          ? 'Use the faucet for demo yield tokens.'
          : 'Fund the account with Friendbot.',
      done: gotTokens,
    },
    {
      n: 2,
      title: 'Prepare for Everspan',
      detail: `Convert ${market.underlyingSymbol} into the SY format used by every strategy.`,
      done: wrapped,
    },
    {
      n: 3,
      title: 'Choose an outcome',
      detail: 'Keep principal, yield, or both — Everspan handles the matching positions.',
      done: split,
    },
  ]

  return (
    <section
      aria-label="Getting started"
      className="rounded-2xl border border-hairline bg-neutral-900 p-5 sm:p-6"
    >
      <h2 className="text-sm font-medium text-neutral-300">Your setup progress</h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        {steps.map((step) => (
          <li
            key={step.n}
            className="flex items-start gap-3 rounded-xl border border-hairline/80 bg-neutral-950/40 px-3 py-3"
          >
            <span
              aria-hidden="true"
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                step.done
                  ? 'bg-positive-400 text-neutral-950'
                  : 'border border-hairline text-neutral-400'
              }`}
            >
              {step.done ? <CheckIcon className="h-3.5 w-3.5" /> : step.n}
            </span>
            <div className="min-w-0">
              <p
                className={`text-sm font-medium ${step.done ? 'text-neutral-400 line-through' : 'text-neutral-100'}`}
              >
                {step.title}
              </p>
              <p className="mt-0.5 text-xs text-neutral-400">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
