/** Marketing route: a progressive, product-led introduction to Everspan. */
import type { ReactElement, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { ScrollReveal } from '../components/ScrollReveal'
import { WelcomeIntro } from '../components/WelcomeIntro'
import { YieldJourney } from '../components/YieldJourney'
import { useSurface } from '../hooks/useSurface'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useNow } from '../hooks/useNow'
import { usePools } from '../hooks/usePools'
import { usePortfolio } from '../hooks/usePortfolio'
import { maturityCountdown } from '../lib/yield'
import { formatAmount } from '../lib/format'
import { ArrowRightIcon, ChartBarIcon, DropletIcon, LockIcon, SwapIcon } from '../components/icons'

/* ─────────────────────────────────────────────────────────
 * LANDING STORYBOARD
 *
 *    0ms   header and hero actions are available behind intro
 * 2320ms   welcome field clears; the quiet hero is revealed
 * scroll   protocol story advances SY → PT/YT → choice
 * scroll   each product chapter reveals once, then stays visible
 *
 * Scroll motion uses IntersectionObserver and GPU-only properties.
 * No scroll listeners, parallax, continuous RAF loops or heavy media.
 * ───────────────────────────────────────────────────────── */

export function Landing(): ReactElement {
  useSurface('site')
  useDocumentTitle('Everspan — fixed yield, built on Stellar')

  const { portfolio } = usePortfolio(null)
  const pools = usePools(null, portfolio.maturities)
  const now = useNow(30_000)

  const tradeable = pools.pools.filter(
    (market) =>
      !maturityCountdown(market.maturity, now).matured &&
      market.pool !== null &&
      market.pool.ptReserve > 0n &&
      market.pool.syReserve > 0n,
  )
  const totalLiquidity = pools.pools.reduce(
    (sum, market) => sum + (market.pool?.syReserve ?? 0n),
    0n,
  )
  const chainKnown = pools.pools.length > 0

  const facts = [
    {
      value: chainKnown ? String(tradeable.length) : '—',
      label: tradeable.length === 1 ? 'Tradeable market' : 'Tradeable markets',
      note: 'LIVE ON TESTNET',
    },
    {
      value: chainKnown ? `${formatAmount(totalLiquidity, 0)} SY` : '—',
      label: 'Pool liquidity',
      note: 'ON CHAIN',
    },
    { value: '0.30%', label: 'AMM swap fee', note: 'FIXED FEE' },
    { value: '7', label: 'Soroban contracts', note: 'OPEN SOURCE' },
  ]

  return (
    <div className="min-h-screen overflow-clip bg-neutral-50 text-neutral-950">
      <WelcomeIntro />
      <div id="landing-content">
        <a
          href="#landing-main"
          className="fixed left-4 top-4 z-50 -translate-y-24 rounded-full bg-neutral-950 px-4 py-3 text-sm font-medium text-neutral-50 transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 focus:ring-offset-neutral-50 motion-reduce:transition-none"
        >
          Skip to main content
        </a>
        <SiteHeader />

        <main id="landing-main" tabIndex={-1}>
          <section className="relative border-b border-neutral-950/10">
            <div className="mx-auto flex min-h-[calc(100svh-4.5rem)] w-full max-w-[96rem] flex-col items-center justify-center px-5 py-20 text-center sm:px-8 lg:px-10">
              <h1 className="text-[clamp(4rem,9.2vw,9rem)] font-normal leading-[0.88] tracking-[-0.065em] lg:whitespace-nowrap">
                Yield, on your terms<span className="text-accent-500">.</span>
              </h1>
              <p className="mt-10 max-w-2xl text-lg leading-relaxed text-neutral-600 sm:text-xl">
                Separate principal from yield. Choose the rate exposure you want to hold, then
                settle on-chain at maturity.
              </p>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <PrimaryLink>Launch App</PrimaryLink>
                <a
                  href="#story"
                  className="inline-flex min-h-11 items-center rounded-full bg-neutral-950 px-6 py-3 text-sm font-medium text-neutral-50 transition-transform duration-100 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50 motion-reduce:transform-none"
                >
                  See how it works
                </a>
              </div>

              <a
                href="#story"
                aria-label="Scroll to discover Everspan"
                className="absolute bottom-5 inline-flex min-h-11 items-center gap-3 rounded-full px-4 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-600 transition-colors duration-100 hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 sm:bottom-8"
              >
                <span aria-hidden="true" className="h-8 w-px bg-neutral-950/30" />
                Scroll to discover
              </a>
            </div>
          </section>

          <section
            id="story"
            className="scroll-mt-16 bg-neutral-950 pb-16 pt-24 text-neutral-50 sm:pt-32 lg:pb-24 lg:pt-40"
          >
            <ScrollReveal className="mx-auto w-full max-w-7xl px-5 text-center sm:px-8 lg:px-10">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-300">
                The Everspan primitive
              </p>
              <h2 className="mx-auto mt-7 max-w-5xl text-[clamp(3.25rem,7vw,7rem)] font-medium leading-[0.88] tracking-[-0.06em]">
                One deposit becomes a market.
              </h2>
              <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-neutral-300">
                Move through the three steps. The position changes as you scroll.
              </p>
            </ScrollReveal>

            <div className="mt-20 sm:mt-28 lg:mt-36">
              <YieldJourney />
            </div>
          </section>

          <section
            aria-label="Protocol at a glance"
            className="border-b border-neutral-950/10 bg-neutral-50"
          >
            <ScrollReveal>
              <dl className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-px bg-neutral-950/10 sm:grid-cols-2 lg:grid-cols-4">
                {facts.map((fact) => (
                  <div
                    key={fact.label}
                    className="min-w-0 bg-neutral-50 px-5 py-10 sm:px-8 sm:py-12 lg:px-10"
                  >
                    <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-600">
                      {fact.note}
                    </dt>
                    <dd className="mt-4 break-words text-4xl font-medium tracking-[-0.045em] tabular-nums sm:text-5xl">
                      {fact.value}
                    </dd>
                    <dd className="mt-2 text-sm text-neutral-600">{fact.label}</dd>
                  </div>
                ))}
              </dl>
            </ScrollReveal>
          </section>

          <section id="markets" className="scroll-mt-16 bg-accent-500 text-neutral-50">
            <ScrollReveal className="mx-auto grid min-h-[88svh] w-full max-w-7xl items-center gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[0.92fr_1.08fr] lg:px-10 lg:py-40">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-50/90">
                  Principal Token · PT
                </p>
                <h2 className="mt-7 max-w-3xl text-[clamp(3.5rem,7vw,7rem)] font-medium leading-[0.87] tracking-[-0.06em]">
                  Know what comes back.
                </h2>
                <p className="mt-8 max-w-xl text-lg leading-relaxed text-neutral-50/80">
                  PT trades below its maturity value. The difference between what you pay and what
                  you redeem defines the implied rate for your position.
                </p>
              </div>
              <FixedRateVisual />
            </ScrollReveal>
          </section>

          <section className="bg-neutral-50">
            <ScrollReveal className="mx-auto grid min-h-[88svh] w-full max-w-7xl items-center gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[1.08fr_0.92fr] lg:px-10 lg:py-40">
              <YieldVisual />
              <div className="lg:order-2">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-500">
                  Yield Token · YT
                </p>
                <h2 className="mt-7 max-w-3xl text-[clamp(3.5rem,7vw,7rem)] font-medium leading-[0.87] tracking-[-0.06em]">
                  Hold the rate itself.
                </h2>
                <p className="mt-8 max-w-xl text-lg leading-relaxed text-neutral-600">
                  YT receives the yield released before maturity. When it moves, Everspan settles
                  both holders first—accrued yield always follows the time it was earned.
                </p>
              </div>
            </ScrollReveal>
          </section>

          <section className="border-y border-neutral-950/10 bg-neutral-200">
            <ScrollReveal className="mx-auto grid min-h-[82svh] w-full max-w-7xl items-center gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-2 lg:px-10 lg:py-40">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-600">
                  PT / SY Market
                </p>
                <h2 className="mt-7 max-w-3xl text-[clamp(3.5rem,7vw,7rem)] font-medium leading-[0.87] tracking-[-0.06em]">
                  Make the market.
                </h2>
                <p className="mt-8 max-w-xl text-lg leading-relaxed text-neutral-600">
                  Swap PT and SY or provide both sides as liquidity. Every pool is tied to one
                  maturity, with a transparent 30 bps fee on each trade.
                </p>
              </div>
              <LiquidityVisual />
            </ScrollReveal>
          </section>

          <section className="bg-neutral-950 text-neutral-50">
            <ScrollReveal className="mx-auto grid min-h-[80svh] w-full max-w-7xl items-center gap-16 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-2 lg:px-10 lg:py-40">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-300">
                  Yield sources
                </p>
                <h2 className="mt-7 text-[clamp(3.5rem,7vw,7rem)] font-medium leading-[0.87] tracking-[-0.06em]">
                  One standard interface.
                </h2>
                <p className="mt-8 max-w-xl text-lg leading-relaxed text-neutral-300">
                  Start with deterministic mUSDY or use a live Blend-backed XLM position. The same
                  split, settlement and market mechanics run across both.
                </p>
              </div>
              <div className="grid gap-px overflow-hidden rounded-2xl bg-neutral-50/15 sm:grid-cols-2">
                <YieldSource
                  label="mUSDY"
                  title="Deterministic yield"
                  body="A ledger-time exchange rate built for repeatable protocol testing."
                />
                <YieldSource
                  label="XLM · BLEND"
                  title="Live lending yield"
                  body="A real Blend v2 lending position behind the same SY interface."
                />
              </div>
            </ScrollReveal>
          </section>

          <section id="security" className="scroll-mt-16 bg-neutral-50">
            <ScrollReveal className="mx-auto flex min-h-[82svh] w-full max-w-7xl flex-col justify-center px-5 py-24 sm:px-8 sm:py-32 lg:px-10 lg:py-40">
              <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-500">
                    Protocol assurance
                  </p>
                  <h2 className="mt-7 max-w-5xl text-[clamp(3.5rem,7vw,7rem)] font-medium leading-[0.87] tracking-[-0.06em]">
                    Your wallet stays in control.
                  </h2>
                </div>
                <p className="max-w-xl text-lg leading-relaxed text-neutral-600">
                  Signing happens inside your wallet. Contracts are open source and deployed on
                  Stellar Testnet. There is no admin path into user balances.
                </p>
              </div>

              <div className="mt-20 grid border-y border-neutral-950/10 sm:grid-cols-3">
                <Assurance
                  number="01"
                  title="Self-custodial"
                  body="Your secret key never enters Everspan."
                />
                <Assurance
                  number="02"
                  title="Open source"
                  body="Seven Soroban contracts, documented and tested."
                />
                <Assurance
                  number="03"
                  title="Explicit settlement"
                  body="Maturity and redemption rules execute on-chain."
                />
              </div>
            </ScrollReveal>
          </section>

          <section className="bg-accent-500 text-neutral-50">
            <div className="mx-auto flex min-h-[72svh] w-full max-w-7xl flex-col justify-between gap-16 px-5 py-20 sm:px-8 sm:py-28 lg:px-10">
              <BrandMark className="h-12 w-12" />
              <ScrollReveal>
                <h2 className="max-w-6xl text-[clamp(3.75rem,9vw,8.75rem)] font-medium leading-[0.84] tracking-[-0.065em]">
                  Put your yield to work.
                </h2>
                <div className="mt-10 flex flex-wrap items-center gap-4">
                  <Link
                    to="/app"
                    className="group inline-flex min-h-12 items-center gap-2 rounded-full bg-neutral-50 px-7 py-3 text-sm font-medium text-neutral-950 transition-transform duration-100 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-50 focus-visible:ring-offset-2 focus-visible:ring-offset-accent-500 motion-reduce:transform-none"
                  >
                    Launch App
                    <ArrowRightIcon className="h-4 w-4 transition-transform duration-100 group-hover:translate-x-1 motion-reduce:transform-none" />
                  </Link>
                  <span className="text-sm text-neutral-50/90">
                    No account. Connect a Stellar wallet.
                  </span>
                </div>
              </ScrollReveal>
            </div>
          </section>
        </main>

        <SiteFooter />
      </div>
    </div>
  )
}

function SiteHeader(): ReactElement {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-950/10 bg-neutral-50/95 backdrop-blur-md">
      <div className="mx-auto flex h-[4.5rem] w-full max-w-[96rem] items-center justify-between gap-6 px-5 sm:px-8 lg:px-10">
        <Link
          to="/"
          className="flex min-h-11 items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-4 focus-visible:ring-offset-neutral-50"
        >
          <BrandMark className="h-6 w-6 text-accent-500" />
          <span className="text-base font-medium tracking-[-0.025em]">Everspan</span>
        </Link>

        <nav aria-label="Primary navigation" className="hidden items-center gap-8 md:flex">
          <a
            className="inline-flex min-h-11 items-center rounded-sm px-1 text-sm text-neutral-600 transition-colors duration-100 hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            href="#story"
          >
            Protocol
          </a>
          <a
            className="inline-flex min-h-11 items-center rounded-sm px-1 text-sm text-neutral-600 transition-colors duration-100 hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            href="#markets"
          >
            Markets
          </a>
          <a
            className="inline-flex min-h-11 items-center rounded-sm px-1 text-sm text-neutral-600 transition-colors duration-100 hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            href="#security"
          >
            Security
          </a>
        </nav>

        <PrimaryLink compact>Launch App</PrimaryLink>
      </div>
    </header>
  )
}

function PrimaryLink({
  children,
  compact = false,
}: {
  children: ReactNode
  compact?: boolean
}): ReactElement {
  return (
    <Link
      to="/app"
      className={`group inline-flex min-h-11 items-center gap-2 rounded-full bg-accent-500 font-medium text-neutral-50 transition-transform duration-100 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50 motion-reduce:transform-none ${
        compact ? 'px-5 py-2 text-sm' : 'px-6 py-3 text-sm'
      }`}
    >
      {children}
      <ArrowRightIcon className="h-4 w-4 transition-transform duration-100 group-hover:translate-x-1 motion-reduce:transform-none" />
    </Link>
  )
}

function FixedRateVisual(): ReactElement {
  return (
    <div className="rounded-3xl bg-neutral-50 p-6 text-neutral-950 shadow-2xl shadow-neutral-950/15 sm:p-8">
      <div className="flex items-center justify-between gap-4 border-b border-neutral-950/10 pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-600">
          Illustrative PT position
        </p>
        <LockIcon className="h-5 w-5 text-accent-500" />
      </div>
      <div className="grid gap-8 py-10 sm:grid-cols-2">
        <Metric label="Cost today" value="958 SY" />
        <Metric label="Redeem at maturity" value="1,000 SY" />
      </div>
      <div className="relative h-px bg-neutral-950/15">
        <span className="absolute -top-1 left-0 h-2 w-2 rounded-full bg-accent-500" />
        <span className="absolute -top-1 right-0 h-2 w-2 rounded-full bg-neutral-950" />
      </div>
      <div className="mt-4 flex justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-600">
        <span>Entry</span>
        <span>90 days</span>
        <span>Maturity</span>
      </div>
    </div>
  )
}

function YieldVisual(): ReactElement {
  return (
    <div className="order-2 rounded-3xl bg-neutral-950 p-6 text-neutral-50 shadow-2xl shadow-neutral-950/15 sm:p-8 lg:order-1">
      <div className="flex items-center justify-between gap-4 border-b border-neutral-50/15 pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-400">
          Yield accrual
        </p>
        <ChartBarIcon className="h-5 w-5 text-accent-400" />
      </div>
      <div className="py-10">
        <p className="text-[clamp(4rem,9vw,7rem)] font-medium leading-none tracking-[-0.06em] text-accent-400">
          YT
        </p>
        <p className="mt-5 max-w-md text-lg leading-relaxed text-neutral-300">
          Yield is measured against each holder’s settlement index and stops exactly at maturity.
        </p>
      </div>
      <div className="grid grid-cols-6 items-end gap-2" aria-hidden="true">
        {['h-3', 'h-5', 'h-8', 'h-12', 'h-16', 'h-20'].map((heightClass) => (
          <span key={heightClass} className={`rounded-full bg-accent-500 ${heightClass}`} />
        ))}
      </div>
    </div>
  )
}

function LiquidityVisual(): ReactElement {
  return (
    <div className="rounded-3xl bg-neutral-50 p-6 shadow-2xl shadow-neutral-950/10 sm:p-8">
      <div className="flex items-center justify-between gap-4 border-b border-neutral-950/10 pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-600">
          Constant product pool
        </p>
        <DropletIcon className="h-5 w-5 text-accent-500" />
      </div>
      <div className="grid gap-3 py-8 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <TokenTile label="PT" value="Principal" />
        <SwapIcon className="mx-auto h-6 w-6 rotate-90 text-neutral-600 sm:rotate-0" />
        <TokenTile label="SY" value="Yield source" accent />
      </div>
      <div className="flex items-baseline justify-between gap-4 rounded-2xl bg-neutral-200 px-5 py-4">
        <span className="text-sm text-neutral-600">Fee per swap</span>
        <span className="text-3xl font-medium tracking-[-0.04em] tabular-nums">0.30%</span>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div>
      <p className="text-sm text-neutral-600">{label}</p>
      <p className="mt-3 text-4xl font-medium tracking-[-0.045em] tabular-nums sm:text-5xl">
        {value}
      </p>
    </div>
  )
}

function TokenTile({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}): ReactElement {
  return (
    <div
      className={`rounded-2xl p-5 ${accent ? 'bg-accent-500 text-neutral-50' : 'bg-neutral-950 text-neutral-50'}`}
    >
      <p className="text-4xl font-medium tracking-[-0.045em]">{label}</p>
      <p className="mt-2 text-xs opacity-90">{value}</p>
    </div>
  )
}

function YieldSource({
  label,
  title,
  body,
}: {
  label: string
  title: string
  body: string
}): ReactElement {
  return (
    <article className="flex min-h-80 flex-col justify-between bg-neutral-900 p-6 sm:p-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent-300">{label}</p>
      <div>
        <h3 className="text-3xl font-medium tracking-[-0.04em]">{title}</h3>
        <p className="mt-4 leading-relaxed text-neutral-300">{body}</p>
      </div>
    </article>
  )
}

function Assurance({
  number,
  title,
  body,
}: {
  number: string
  title: string
  body: string
}): ReactElement {
  return (
    <article className="border-b border-neutral-950/10 py-8 last:border-b-0 sm:border-b-0 sm:border-r sm:px-8 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0">
      <p className="font-mono text-[10px] tracking-[0.18em] text-accent-500">{number}</p>
      <h3 className="mt-8 text-xl font-medium tracking-[-0.025em]">{title}</h3>
      <p className="mt-3 max-w-xs leading-relaxed text-neutral-600">{body}</p>
    </article>
  )
}

function SiteFooter(): ReactElement {
  return (
    <footer className="bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-5 w-5 text-accent-400" />
          <span className="text-sm font-medium tracking-[-0.015em]">Everspan</span>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-400">
          Stellar Testnet · Soroban · 2026
        </p>
      </div>
    </footer>
  )
}
