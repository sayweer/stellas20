/** Marketing route: what the protocol is, for someone who has never seen it. */
import type { ReactElement, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { useSurface } from '../hooks/useSurface'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { ArrowRightIcon } from '../components/icons'

/** A claim we can point at on-chain — no projections, no TVL theatre. */
const FACTS = [
  { value: '7', label: 'Soroban contracts', note: 'LIVE ON TESTNET' },
  { value: '0.30%', label: 'AMM swap fee', note: 'CPMM' },
  { value: '~5s', label: 'Settlement', note: 'STELLAR' },
  { value: '100%', label: 'Non-custodial', note: 'YOUR KEYS' },
]

export function Landing(): ReactElement {
  useSurface('site')
  useDocumentTitle('stellas20 — lock a fixed yield on Stellar')

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="grid-rule relative overflow-hidden border-b border-neutral-950/10">
          {/* Oversized mark bleeding off the right edge — the brand as texture,
              not decoration bolted on. Hidden on small screens where it would
              crowd the headline instead of framing it. */}
          <BrandMark
            className="pointer-events-none absolute -right-28 top-1/2 hidden h-[34rem] w-[34rem] -translate-y-1/2 text-neutral-950/[0.035] lg:block"
          />

          <div className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-32 lg:py-40">
            <p className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-600">
              <span aria-hidden="true" className="h-px w-8 bg-neutral-600/50" />
              Fixed-income primitive on Stellar
            </p>

            <h1 className="mt-8 max-w-4xl text-[clamp(2.75rem,8.5vw,6.5rem)] font-medium leading-[0.92] tracking-[-0.045em]">
              Lock a fixed yield on Stellar.
            </h1>

            <p className="mt-8 max-w-xl text-lg leading-relaxed text-neutral-600 sm:text-xl">
              Split any yield-bearing token into Principal and Yield. Sell the yield to lock a fixed
              rate until maturity — or buy it for leveraged exposure to the rate.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                to="/app"
                className="group inline-flex items-center gap-2 rounded-full bg-accent-500 px-6 py-3.5 text-sm font-medium text-neutral-950 transition-colors hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50"
              >
                Launch App
                <ArrowRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#how"
                className="inline-flex items-center rounded-full border border-neutral-950/15 px-6 py-3.5 text-sm font-medium transition-colors hover:border-neutral-950/30 hover:bg-neutral-950/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50"
              >
                How it works
              </a>
            </div>
          </div>
        </section>

        <section aria-label="At a glance" className="border-b border-neutral-950/10">
          <dl className="mx-auto grid w-full max-w-6xl grid-cols-2 divide-neutral-950/10 sm:divide-x lg:grid-cols-4">
            {FACTS.map((fact) => (
              <div key={fact.label} className="px-6 py-8 sm:py-10">
                <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-600">
                  {fact.note}
                </dt>
                <dd className="mt-3 text-4xl font-medium tracking-[-0.03em] tabular-nums sm:text-5xl">
                  {fact.value}
                </dd>
                <dd className="mt-1.5 text-sm text-neutral-600">{fact.label}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="how" className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-24 sm:py-32">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-600">
            How it works
          </p>
          <h2 className="mt-6 max-w-2xl text-[clamp(2rem,4.5vw,3.5rem)] font-medium leading-[1.02] tracking-[-0.035em]">
            One deposit. Two tokens. Your choice of risk.
          </h2>

          <ol className="mt-16 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            <Step
              n="I"
              title="Deposit and split"
              body="Wrap a yield-bearing asset into SY, then split it into a Principal Token and a Yield Token. Together they always redeem for the original deposit."
            />
            <Step
              n="II"
              title="Sell the yield, fix your rate"
              body="Sell YT — or buy PT below par on the AMM. Either way you know the exact amount you redeem at maturity, whatever the underlying rate does after."
            />
            <Step
              n="III"
              title="Or take the other side"
              body="Buy YT to get leveraged exposure to the yield itself. It pays out continuously and expires worthless at maturity — the rate is the whole position."
            />
          </ol>
        </section>

        <section className="border-t border-neutral-950/10">
          <div className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-28">
            <h2 className="max-w-2xl text-[clamp(2rem,4.5vw,3.5rem)] font-medium leading-[1.02] tracking-[-0.035em]">
              Every position is enforced on-chain.
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-neutral-600">
              Contracts are open source and deployed on Stellar Testnet. Funds stay in your wallet
              until a call executes; the protocol has no admin path into user balances.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                to="/app"
                className="group inline-flex items-center gap-2 rounded-full bg-accent-500 px-6 py-3.5 text-sm font-medium text-neutral-950 transition-colors hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50"
              >
                Launch App
                <ArrowRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              <span className="text-sm text-neutral-600">No sign-up — just connect a wallet.</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-neutral-950/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-5 w-5" />
            <span className="text-sm font-medium tracking-[-0.01em]">stellas20</span>
          </div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-600">
            Stellar Testnet · Soroban
          </p>
        </div>
      </footer>
    </div>
  )
}

function SiteHeader(): ReactElement {
  return (
    <header className="sticky top-0 z-30 border-b border-neutral-950/10 bg-neutral-50/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6">
        <Link
          to="/"
          className="flex items-center gap-2.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-4 focus-visible:ring-offset-neutral-50"
        >
          <BrandMark className="h-6 w-6" />
          <span className="text-base font-medium tracking-[-0.02em]">stellas20</span>
        </Link>
        <Link
          to="/app"
          className="inline-flex items-center rounded-full bg-accent-500 px-5 py-2.5 text-sm font-medium text-neutral-950 transition-colors hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50"
        >
          Launch App
        </Link>
      </div>
    </header>
  )
}

function Step({ n, title, body }: { n: string; title: string; body: ReactNode }): ReactElement {
  return (
    <li>
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-600">{n}</p>
      <h3 className="mt-4 text-xl font-medium tracking-[-0.02em]">{title}</h3>
      <p className="mt-3 leading-relaxed text-neutral-600">{body}</p>
    </li>
  )
}
