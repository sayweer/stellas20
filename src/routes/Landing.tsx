/** Marketing route: a product-led introduction to Everspan. */
import type { ReactElement, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { WelcomeIntro } from '../components/WelcomeIntro'
import { useSurface } from '../hooks/useSurface'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useNow } from '../hooks/useNow'
import { usePools } from '../hooks/usePools'
import { usePortfolio } from '../hooks/usePortfolio'
import { maturityCountdown } from '../lib/yield'
import { formatAmount } from '../lib/format'
import {
  ArrowRightIcon,
  ChartBarIcon,
  ClockIcon,
  DropletIcon,
  LayersIcon,
  LockIcon,
  SplitIcon,
  SwapIcon,
} from '../components/icons'

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
      <SiteHeader />

      <main>
        <section className="border-b border-neutral-950/15">
          <div className="mx-auto grid min-h-[calc(100svh-4.5rem)] w-full max-w-7xl items-center gap-14 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.08fr_0.92fr] lg:px-10 lg:py-24">
            <div>
              <p className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.18em] text-neutral-600">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent-500" />
                Fixed income on Stellar
              </p>
              <h1 className="mt-8 max-w-4xl text-[clamp(4rem,10vw,8.5rem)] font-medium leading-[0.82] tracking-[-0.065em]">
                Yield,
                <span className="block text-accent-500">on your terms.</span>
              </h1>
              <p className="mt-9 max-w-xl text-lg leading-relaxed text-neutral-600 sm:text-xl">
                Separate a yield-bearing asset into principal and yield. Hold the exposure you want,
                trade the rest, and settle on-chain at maturity.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <PrimaryLink>Launch App</PrimaryLink>
                <a
                  href="#protocol"
                  className="inline-flex min-h-11 items-center rounded-full border border-neutral-950/25 px-6 py-3 text-sm font-medium transition-colors duration-100 hover:bg-neutral-950 hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50"
                >
                  Explore Everspan
                </a>
              </div>
            </div>

            <ProtocolPreview />
          </div>
        </section>

        <section aria-label="Protocol at a glance" className="border-b border-neutral-950/15">
          <dl className="mx-auto grid w-full max-w-7xl grid-cols-2 lg:grid-cols-4">
            {facts.map((fact, index) => (
              <div
                key={fact.label}
                className={`px-5 py-8 sm:px-8 sm:py-10 lg:px-10 ${
                  index % 2 === 1 ? 'border-l border-neutral-950/15' : ''
                } ${index >= 2 ? 'border-t border-neutral-950/15 lg:border-t-0' : ''} ${
                  index > 0 ? 'lg:border-l' : ''
                }`}
              >
                <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-600">
                  {fact.note}
                </dt>
                <dd className="mt-3 text-4xl font-medium tracking-[-0.045em] tabular-nums sm:text-5xl">
                  {fact.value}
                </dd>
                <dd className="mt-2 text-sm text-neutral-600">{fact.label}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="protocol" className="scroll-mt-20 bg-accent-500 text-neutral-50">
          <div className="mx-auto grid w-full max-w-7xl gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[0.85fr_1.15fr] lg:items-end lg:px-10 lg:py-40">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-50/70">
                The primitive
              </p>
              <h2 className="mt-6 text-[clamp(3rem,7vw,6.75rem)] font-medium leading-[0.88] tracking-[-0.06em]">
                One asset.
                <span className="block">Two positions.</span>
              </h2>
            </div>
            <div className="max-w-xl lg:justify-self-end">
              <p className="text-xl leading-relaxed text-neutral-50/85 sm:text-2xl">
                Everspan wraps yield-bearing assets into Standardized Yield, then splits each unit
                into a Principal Token and a Yield Token.
              </p>
              <p className="mt-6 leading-relaxed text-neutral-50/70">
                PT represents the principal redeemable at maturity. YT receives the yield released
                before maturity. Together, they account for the original position.
              </p>
            </div>
          </div>

          <div className="mx-auto grid w-full max-w-7xl border-t border-neutral-50/25 lg:grid-cols-3">
            <RedStep
              number="01"
              icon={<LayersIcon className="h-5 w-5" />}
              title="Wrap into SY"
              body="Deposit a supported yield-bearing asset. SY standardizes how its exchange rate is read by the protocol."
            />
            <RedStep
              number="02"
              icon={<SplitIcon className="h-5 w-5" />}
              title="Split into PT + YT"
              body="Choose a maturity and split SY into equal principal and yield token positions."
            />
            <RedStep
              number="03"
              icon={<SwapIcon className="h-5 w-5" />}
              title="Trade your exposure"
              body="Sell YT, buy discounted PT, take a yield position, or provide liquidity to the PT/SY market."
            />
          </div>
        </section>

        <section id="markets" className="scroll-mt-20 bg-neutral-50">
          <div className="mx-auto w-full max-w-7xl px-5 py-24 sm:px-8 sm:py-32 lg:px-10 lg:py-40">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-end">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-600">
                  Position by design
                </p>
                <h2 className="mt-6 max-w-3xl text-[clamp(3rem,6vw,6rem)] font-medium leading-[0.9] tracking-[-0.055em]">
                  Choose what you want to hold.
                </h2>
              </div>
              <p className="max-w-xl text-lg leading-relaxed text-neutral-600 lg:justify-self-end">
                Principal, yield and liquidity become independent choices. Everspan turns one
                passive position into a market with distinct risk and return profiles.
              </p>
            </div>

            <div className="mt-16 grid gap-4 lg:grid-cols-12">
              <FeatureCard
                className="bg-neutral-950 text-neutral-50 lg:col-span-7"
                eyebrow="FIXED-RATE POSITION"
                icon={<LockIcon className="h-6 w-6" />}
                title="Buy principal below par. Redeem at maturity."
                body="PT trades against SY in a maturity-specific AMM. Buying below its maturity value sets the implied rate for the position you hold."
                meta="PT · PRINCIPAL TOKEN"
              />
              <FeatureCard
                className="bg-neutral-200 text-neutral-950 lg:col-span-5"
                eyebrow="YIELD EXPOSURE"
                icon={<ChartBarIcon className="h-6 w-6" />}
                title="Hold the rate itself."
                body="YT receives the yield released by the underlying asset until maturity. Transfers settle accrued yield for both sides before ownership changes."
                meta="YT · YIELD TOKEN"
              />
              <FeatureCard
                className="bg-accent-500 text-neutral-50 lg:col-span-5"
                eyebrow="MARKET LIQUIDITY"
                icon={<DropletIcon className="h-6 w-6" />}
                title="Make the fixed-rate market."
                body="Supply PT and SY to the constant-product pool. Liquidity providers earn the 30 bps fee paid on each swap."
                meta="PT / SY · CPMM"
              />
              <FeatureCard
                className="border border-neutral-950/15 bg-neutral-50 text-neutral-950 lg:col-span-7"
                eyebrow="MATURITY"
                icon={<ClockIcon className="h-6 w-6" />}
                title="A clear end state."
                body="Yield accrual stops at maturity. PT becomes redeemable for principal at the frozen maturity rate, while LP withdrawals remain available."
                meta="SETTLED ON STELLAR"
              />
            </div>
          </div>
        </section>

        <section className="bg-neutral-950 text-neutral-50">
          <div className="mx-auto grid w-full max-w-7xl gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-2 lg:items-center lg:px-10 lg:py-40">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-400">
                Two yield sources
              </p>
              <h2 className="mt-6 text-[clamp(3rem,6vw,6rem)] font-medium leading-[0.9] tracking-[-0.055em]">
                One standard interface.
              </h2>
              <p className="mt-8 max-w-xl text-lg leading-relaxed text-neutral-300">
                Use deterministic mUSDY for the testnet baseline or switch to a live Blend-backed
                XLM market. The same split, settlement and AMM mechanics run across both.
              </p>
            </div>
            <div className="grid gap-px overflow-hidden rounded-2xl bg-neutral-50/15 sm:grid-cols-2">
              <YieldSource
                label="mUSDY"
                title="Deterministic yield"
                body="A test asset with a ledger-time exchange rate for repeatable protocol testing."
              />
              <YieldSource
                label="XLM · BLEND"
                title="Live lending yield"
                body="A real Blend v2 lending position exposed through the same Standardized Yield interface."
              />
            </div>
          </div>
        </section>

        <section
          id="security"
          className="scroll-mt-20 border-b border-neutral-950/15 bg-neutral-50"
        >
          <div className="mx-auto w-full max-w-7xl px-5 py-24 sm:px-8 sm:py-32 lg:px-10 lg:py-40">
            <div className="grid gap-14 lg:grid-cols-[1.1fr_0.9fr]">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-600">
                  Protocol assurance
                </p>
                <h2 className="mt-6 max-w-4xl text-[clamp(3rem,6vw,6.5rem)] font-medium leading-[0.88] tracking-[-0.06em]">
                  Your wallet stays in control.
                </h2>
              </div>
              <p className="max-w-xl self-end text-lg leading-relaxed text-neutral-600">
                Signing happens inside your wallet. Contracts are open source and deployed on
                Stellar Testnet. The protocol has no admin path into user balances.
              </p>
            </div>

            <div className="mt-16 grid border-y border-neutral-950/15 sm:grid-cols-3">
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
          </div>
        </section>

        <section className="bg-accent-500 text-neutral-50">
          <div className="mx-auto flex min-h-[70svh] w-full max-w-7xl flex-col justify-between gap-16 px-5 py-20 sm:px-8 sm:py-28 lg:px-10">
            <BrandMark className="h-12 w-12" />
            <div>
              <h2 className="max-w-5xl text-[clamp(3.5rem,9vw,8.5rem)] font-medium leading-[0.84] tracking-[-0.065em]">
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
                <span className="text-sm text-neutral-50/75">
                  No account. Connect a Stellar wallet.
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}

function SiteHeader(): ReactElement {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-950/15 bg-neutral-50/95 backdrop-blur-md">
      <div className="mx-auto flex h-[4.5rem] w-full max-w-7xl items-center justify-between gap-6 px-5 sm:px-8 lg:px-10">
        <Link
          to="/"
          className="flex min-h-11 items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-4 focus-visible:ring-offset-neutral-50"
        >
          <BrandMark className="h-6 w-6 text-accent-500" />
          <span className="text-base font-medium tracking-[-0.025em]">Everspan</span>
        </Link>

        <nav aria-label="Primary navigation" className="hidden items-center gap-8 md:flex">
          <a
            className="text-sm text-neutral-600 transition-colors duration-100 hover:text-neutral-950 focus-visible:outline-none focus-visible:text-accent-500"
            href="#protocol"
          >
            Protocol
          </a>
          <a
            className="text-sm text-neutral-600 transition-colors duration-100 hover:text-neutral-950 focus-visible:outline-none focus-visible:text-accent-500"
            href="#markets"
          >
            Markets
          </a>
          <a
            className="text-sm text-neutral-600 transition-colors duration-100 hover:text-neutral-950 focus-visible:outline-none focus-visible:text-accent-500"
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

function ProtocolPreview(): ReactElement {
  return (
    <div className="landing-hero-visual relative min-h-[32rem] overflow-hidden rounded-[2rem] border border-neutral-950/15 bg-neutral-200 p-5 sm:p-8 lg:min-h-[38rem]">
      <div className="absolute inset-x-5 top-5 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.18em] text-neutral-600 sm:inset-x-8 sm:top-8">
        <span>Position builder</span>
        <span>Stellar · Testnet</span>
      </div>

      <div className="absolute inset-x-5 bottom-5 rounded-2xl bg-neutral-950 p-5 text-neutral-50 shadow-2xl shadow-neutral-950/20 sm:inset-x-8 sm:bottom-8 sm:p-7">
        <div className="flex items-end justify-between gap-4 border-b border-neutral-50/15 pb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-neutral-400">Deposit</p>
            <p className="mt-2 text-4xl font-medium tracking-[-0.04em] tabular-nums sm:text-5xl">
              1,000 SY
            </p>
          </div>
          <SplitIcon className="h-8 w-8 text-accent-400" />
        </div>
        <div className="grid gap-3 pt-5 sm:grid-cols-2">
          <div className="rounded-xl bg-neutral-50 p-4 text-neutral-950">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-600">
              Principal
            </p>
            <p className="mt-5 text-2xl font-medium tracking-[-0.03em] tabular-nums">1,000 PT</p>
            <p className="mt-1 text-xs text-neutral-600">Redeemable at maturity</p>
          </div>
          <div className="rounded-xl bg-accent-500 p-4 text-neutral-50">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-50/70">
              Yield
            </p>
            <p className="mt-5 text-2xl font-medium tracking-[-0.03em] tabular-nums">1,000 YT</p>
            <p className="mt-1 text-xs text-neutral-50/70">Accrues until maturity</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function RedStep({
  number,
  icon,
  title,
  body,
}: {
  number: string
  icon: ReactNode
  title: string
  body: string
}): ReactElement {
  return (
    <article className="border-b border-neutral-50/25 px-5 py-10 last:border-b-0 sm:px-8 lg:border-b-0 lg:border-r lg:px-10 lg:py-12 lg:last:border-r-0">
      <div className="flex items-center justify-between text-neutral-50/75">
        <span className="font-mono text-[10px] tracking-[0.18em]">{number}</span>
        <span aria-hidden="true">{icon}</span>
      </div>
      <h3 className="mt-12 text-2xl font-medium tracking-[-0.035em]">{title}</h3>
      <p className="mt-4 leading-relaxed text-neutral-50/75">{body}</p>
    </article>
  )
}

function FeatureCard({
  className,
  eyebrow,
  icon,
  title,
  body,
  meta,
}: {
  className: string
  eyebrow: string
  icon: ReactNode
  title: string
  body: string
  meta: string
}): ReactElement {
  return (
    <article
      className={`flex min-h-[28rem] flex-col justify-between rounded-2xl p-6 sm:p-8 ${className}`}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] opacity-60">{eyebrow}</p>
        <span aria-hidden="true">{icon}</span>
      </div>
      <div>
        <h3 className="max-w-2xl text-[clamp(2rem,4vw,3.75rem)] font-medium leading-[0.98] tracking-[-0.05em]">
          {title}
        </h3>
        <p className="mt-6 max-w-xl leading-relaxed opacity-75">{body}</p>
        <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.18em] opacity-60">{meta}</p>
      </div>
    </article>
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
    <article className="min-h-[20rem] bg-neutral-900 p-6 sm:p-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent-300">{label}</p>
      <h3 className="mt-20 text-3xl font-medium tracking-[-0.04em]">{title}</h3>
      <p className="mt-4 leading-relaxed text-neutral-300">{body}</p>
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
    <article className="border-b border-neutral-950/15 py-8 last:border-b-0 sm:border-b-0 sm:border-r sm:px-8 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0">
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
