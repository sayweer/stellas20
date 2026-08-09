/** Marketing route: a progressive, product-led introduction to Everspan. */
import { useRef, type ReactElement, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { OpeningScene } from '../components/OpeningScene'
import { PixelText } from '../components/PixelText'
import { YieldJourney } from '../components/YieldJourney'
import { SceneParallax } from '../components/scroll/SceneParallax'
import { ScrollScene } from '../components/scroll/ScrollScene'
import { ScrollStage } from '../components/scroll/ScrollStage'
import type { StageApi } from '../components/scroll/stageContext'
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
 *    0ms   the quiet hero is on screen; header and hero actions are live
 * scroll   each chapter rises over the last one as an inset card,
 *          then expands to full bleed while the layer beneath recedes
 *
 * The page does not scroll past the hero: scrolling drives the chapters
 * directly (see `ScrollStage`). Below `md`, and under reduced motion, the
 * same scenes render as ordinary stacked sections.
 *
 * Scene indices are referenced by the header nav — keep NAV_SCENES in sync
 * with the order of <ScrollScene> children below.
 * ───────────────────────────────────────────────────────── */

const NAV_SCENES = { story: 1, markets: 3, security: 7 } as const

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

  const stage = useRef<StageApi | null>(null)

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-950">
      <div id="landing-content">
        <a
          href="#landing-main"
          className="fixed left-4 top-4 z-50 -translate-y-24 rounded-full bg-neutral-950 px-4 py-3 text-sm font-medium text-neutral-50 transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 focus:ring-offset-neutral-50 motion-reduce:transition-none"
        >
          Skip to main content
        </a>
        <SiteHeader onNavigate={(scene) => stage.current?.scrollToScene(scene)} />

        <main id="landing-main" tabIndex={-1}>
          <ScrollStage apiRef={stage}>
            <ScrollScene
              custom
              /* Long enough that each figure gets a readable pause and a push
                 that takes real scrolling to complete — the belt is scrubbed,
                 so this length is the only thing that sets its pace. */
              length={3.8}
              className="bg-neutral-50 text-neutral-950"
              label="Everspan"
            >
              <OpeningScene
                stats={facts}
                headline={
                  <h1 className="mx-auto w-full max-w-[96rem] px-5 text-center text-[clamp(2.75rem,9.2vw,9rem)] font-normal leading-[0.88] tracking-[-0.065em] sm:px-8 lg:whitespace-nowrap lg:px-10">
                    Yield, on your terms<span className="text-accent-500">.</span>
                  </h1>
                }
              >
                <SceneBody className="max-w-[96rem] text-center">
                  <p className="mt-12 text-xl font-medium tracking-[-0.02em] text-neutral-950 sm:mt-14 sm:text-3xl">
                    <PixelText>Explore Innovation</PixelText>
                  </p>
                  <p className="mx-auto mt-4 max-w-3xl text-xl leading-relaxed text-neutral-950 sm:text-3xl">
                    <PixelText delay={160}>
                      Your principal, protected. Your yield, your call.
                    </PixelText>
                  </p>
                  <div className="mx-auto mt-10 grid w-full max-w-xs gap-3 sm:flex sm:max-w-none sm:flex-wrap sm:items-center sm:justify-center">
                    <PrimaryLink>Launch App</PrimaryLink>
                    <button
                      type="button"
                      onClick={() => stage.current?.scrollToScene(NAV_SCENES.story)}
                      className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-neutral-950 px-6 py-3 text-sm font-medium text-neutral-50 [touch-action:manipulation] [-webkit-tap-highlight-color:transparent] transition-transform duration-100 ease-spring hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 motion-safe:active:scale-[0.97] active:duration-75 active:ease-press motion-reduce:transform-none sm:w-auto"
                    >
                      See how it works
                    </button>
                  </div>
                </SceneBody>
              </OpeningScene>
            </ScrollScene>

            <ScrollScene id="story" className="bg-neutral-950 text-neutral-50">
              <SceneBody className="text-center">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-300">
                  The Everspan primitive
                </p>
                <h2 className="mx-auto mt-7 max-w-5xl text-[clamp(3.25rem,7vw,7rem)] font-medium leading-[0.88] tracking-[-0.06em]">
                  One deposit becomes a market.
                </h2>
                <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-neutral-300">
                  Three steps turn a yield-bearing deposit into two tradeable positions.
                </p>
              </SceneBody>
            </ScrollScene>

            <ScrollScene
              className="bg-neutral-950 text-neutral-50"
              label="How a position is built"
              length={2.5}
            >
              <YieldJourney />
            </ScrollScene>

            <ScrollScene id="markets" className="bg-accent-500 text-neutral-50">
              <SceneBody className="grid items-center gap-14 lg:grid-cols-[0.92fr_1.08fr]">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-50/90">
                    Principal Token · PT
                  </p>
                  <h2 className="mt-7 max-w-3xl text-[clamp(3rem,6vw,6rem)] font-medium leading-[0.87] tracking-[-0.06em]">
                    Know what comes back.
                  </h2>
                  <p className="mt-8 max-w-xl text-lg leading-relaxed text-neutral-50/80">
                    PT trades below its maturity value. The difference between what you pay and what
                    you redeem defines the implied rate for your position.
                  </p>
                </div>
                <SceneParallax>
                  <FixedRateVisual />
                </SceneParallax>
              </SceneBody>
            </ScrollScene>

            <ScrollScene className="bg-neutral-50 text-neutral-950">
              <SceneBody className="grid items-center gap-14 lg:grid-cols-[1.08fr_0.92fr]">
                <SceneParallax className="order-2 lg:order-1">
                  <YieldVisual />
                </SceneParallax>
                <div className="lg:order-2">
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-500">
                    Yield Token · YT
                  </p>
                  <h2 className="mt-7 max-w-3xl text-[clamp(3rem,6vw,6rem)] font-medium leading-[0.87] tracking-[-0.06em]">
                    Hold the rate itself.
                  </h2>
                  <p className="mt-8 max-w-xl text-lg leading-relaxed text-neutral-600">
                    YT receives the yield released before maturity. When it moves, Everspan settles
                    both holders first—accrued yield always follows the time it was earned.
                  </p>
                </div>
              </SceneBody>
            </ScrollScene>

            <ScrollScene className="bg-neutral-200 text-neutral-950">
              <SceneBody className="grid items-center gap-14 lg:grid-cols-2">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-600">
                    PT / SY Market
                  </p>
                  <h2 className="mt-7 max-w-3xl text-[clamp(3rem,6vw,6rem)] font-medium leading-[0.87] tracking-[-0.06em]">
                    Make the market.
                  </h2>
                  <p className="mt-8 max-w-xl text-lg leading-relaxed text-neutral-600">
                    Swap PT and SY or provide both sides as liquidity. Every pool is tied to one
                    maturity, with a transparent 30 bps fee on each trade.
                  </p>
                </div>
                <SceneParallax>
                  <LiquidityVisual />
                </SceneParallax>
              </SceneBody>
            </ScrollScene>

            <ScrollScene className="bg-neutral-950 text-neutral-50">
              <SceneBody className="grid items-center gap-16 lg:grid-cols-2">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-300">
                    Yield sources
                  </p>
                  <h2 className="mt-7 text-[clamp(3rem,6vw,6rem)] font-medium leading-[0.87] tracking-[-0.06em]">
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
              </SceneBody>
            </ScrollScene>

            <ScrollScene id="security" className="bg-neutral-50 text-neutral-950">
              <SceneBody>
                <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-500">
                      Protocol assurance
                    </p>
                    <h2 className="mt-7 max-w-5xl text-[clamp(3rem,6vw,6rem)] font-medium leading-[0.87] tracking-[-0.06em]">
                      Your wallet stays in control.
                    </h2>
                  </div>
                  <p className="max-w-xl text-lg leading-relaxed text-neutral-600">
                    Signing happens inside your wallet. Contracts are open source and deployed on
                    Stellar Testnet. There is no admin path into user balances.
                  </p>
                </div>

                <div className="mt-16 grid border-y border-neutral-950/10 sm:grid-cols-3">
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
              </SceneBody>
            </ScrollScene>

            <ScrollScene className="bg-accent-500 text-neutral-50">
              <SceneBody>
                <BrandMark className="h-12 w-12" />
                <h2 className="mt-14 max-w-6xl text-[clamp(3.25rem,7.5vw,7.5rem)] font-medium leading-[0.84] tracking-[-0.065em]">
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
              </SceneBody>
            </ScrollScene>
          </ScrollStage>
        </main>

        <SiteFooter />
      </div>
    </div>
  )
}

/**
 * Shared inner container for a scene. The stage centres scenes vertically, so
 * this only owns horizontal rhythm — no vertical padding that would fight the
 * fixed viewport height while pinned.
 */
function SceneBody({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}): ReactElement {
  return (
    <div className={`mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10 ${className}`}>{children}</div>
  )
}

/**
 * Fixed, not sticky: in flow the header pushed the scroll stage down by its own
 * height, and that offset became dead scroll before the opening could start.
 */
function SiteHeader({ onNavigate }: { onNavigate: (scene: number) => void }): ReactElement {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-neutral-950/10 bg-neutral-50/95 backdrop-blur-md">
      <div className="mx-auto flex h-[4.5rem] w-full max-w-[96rem] items-center justify-between gap-6 px-5 sm:px-8 lg:px-10">
        <Link
          to="/"
          className="flex min-h-11 items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-4 focus-visible:ring-offset-neutral-50"
        >
          <BrandMark className="h-6 w-6 text-accent-500" />
          <span className="text-base font-medium tracking-[-0.025em]">Everspan</span>
        </Link>

        {/* While the stage is pinned every scene sits at the same document
            offset, so an href anchor cannot reach one — the stage maps a scene
            index back to its scroll position instead. */}
        <nav aria-label="Primary navigation" className="hidden items-center gap-8 md:flex">
          {(
            [
              ['Protocol', NAV_SCENES.story],
              ['Markets', NAV_SCENES.markets],
              ['Security', NAV_SCENES.security],
            ] as const
          ).map(([label, scene]) => (
            <button
              key={label}
              type="button"
              onClick={() => onNavigate(scene)}
              className="inline-flex min-h-11 items-center rounded-sm px-1 text-sm text-neutral-600 transition-colors duration-100 hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            >
              {label}
            </button>
          ))}
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
      className={`group inline-flex items-center justify-center gap-2 rounded-full bg-accent-500 font-medium text-neutral-50 [touch-action:manipulation] [-webkit-tap-highlight-color:transparent] transition-transform duration-100 ease-spring hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 motion-safe:active:scale-[0.97] active:duration-75 active:ease-press motion-reduce:transform-none ${
        compact ? 'min-h-11 px-5 py-2 text-sm' : 'min-h-12 w-full px-6 py-3 text-sm sm:w-auto'
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
