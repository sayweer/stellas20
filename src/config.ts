import { Networks } from '@stellar/stellar-sdk'

/** Typed, centralized app configuration. Testnet only — no mainnet values. */
export interface AppConfig {
  /** Horizon REST endpoint (Testnet). */
  readonly horizonUrl: string
  /** Friendbot funding endpoint (Testnet). */
  readonly friendbotUrl: string
  /** stellar.expert explorer base URL for linking transactions (Testnet). */
  readonly stellarExpertUrl: string
  /** Network passphrase identifying Stellar Testnet, sourced from the SDK. */
  readonly networkPassphrase: string
  /** Soroban RPC endpoint (Testnet) for contract simulate/send/getEvents. */
  readonly sorobanRpcUrl: string
  /**
   * WalletConnect project id (free, from reown.com). Empty means the wallet
   * picker only offers wallets that inject into the page — which on a phone is
   * none of them.
   */
  readonly walletConnectProjectId: string
  /** Sentry browser project DSN. Empty disables error reporting. */
  readonly sentryDsn: string
  /** External feedback form. Empty hides the feedback link. */
  readonly feedbackFormUrl: string
}

/**
 * Resolved configuration. Reads VITE_-prefixed env vars and falls back to the
 * Testnet defaults so the app works with zero local setup.
 */
export const config: AppConfig = {
  // `||` throughout: a blank env var is an empty string, and falling back to the
  // Testnet default beats pointing the SDK at "".
  horizonUrl: import.meta.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org',
  friendbotUrl: import.meta.env.VITE_FRIENDBOT_URL || 'https://friendbot.stellar.org',
  stellarExpertUrl:
    import.meta.env.VITE_STELLAR_EXPERT_URL || 'https://stellar.expert/explorer/testnet',
  networkPassphrase: Networks.TESTNET,
  sorobanRpcUrl: import.meta.env.VITE_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
  /**
   * WalletConnect project id (free, from reown.com). Optional: without it the
   * picker only offers wallets that inject into the page, which on a phone
   * means none of the extension wallets can connect. See `src/lib/wallet.ts`.
   */
  walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '',
  sentryDsn: import.meta.env.VITE_SENTRY_DSN || '',
  feedbackFormUrl: import.meta.env.VITE_FEEDBACK_FORM_URL || '',
}

/** Identifier of a deployed market (one SY vault + its Market + its AMM). */
export type MarketKey = 'musdy' | 'blend'

/**
 * A complete, independent deployment: one yield source wrapped by one SY vault,
 * with its own Market and PT/SY pool. The contracts share nothing across
 * markets except the PT/YT wasm, so switching markets means switching every
 * contract ID at once.
 */
export interface MarketConfig {
  readonly key: MarketKey
  /** Tab label in the market switcher. */
  readonly label: string
  /** Ticker of the asset users bring in, e.g. `mUSDY` or `XLM`. */
  readonly underlyingSymbol: string
  /** SEP-41 contract of that asset (MockYieldToken, or the XLM SAC). */
  readonly underlyingContractId: string
  readonly syVaultContractId: string
  readonly splitterContractId: string
  readonly ammContractId: string
  /** Where the yield actually comes from — shown to the user, verbatim. */
  readonly yieldSource: string
  /**
   * Which kind of yield source sits behind the vault. Only two things differ
   * per kind: the mock underlying has a self-service faucet and publishes a
   * rate checkpoint (slope included) the client can extrapolate between polls;
   * a real one has neither.
   */
  readonly source: 'mock' | 'blend'
  /** How to obtain the underlying when there is no faucet. */
  readonly fundingHint?: string
}

const blendSyVault = import.meta.env.VITE_BLEND_SY_VAULT_CONTRACT_ID ?? ''
const blendSplitter = import.meta.env.VITE_BLEND_SPLITTER_CONTRACT_ID ?? ''
const blendAmm = import.meta.env.VITE_BLEND_AMM_CONTRACT_ID ?? ''

const musdyMarket: MarketConfig = {
  key: 'musdy',
  label: 'mUSDY',
  underlyingSymbol: 'mUSDY',
  // Default to the current Testnet deployment (public, non-secret) so the app
  // works with zero config; override via env for a fresh deployment. `||`, not
  // `??`: a variable declared-but-blank in a hosting dashboard is a blank
  // string, not undefined, and would otherwise point every contract call at an
  // empty id — the same guard the Blend block below already used.
  underlyingContractId:
    import.meta.env.VITE_MYT_CONTRACT_ID ||
    'CDN42W36GJ2AGPWGDMEL2BUEKCGCVCQ4GRLFXUBPTQUDIEDWQQHZG3TR',
  syVaultContractId:
    import.meta.env.VITE_SY_VAULT_CONTRACT_ID ||
    'CBPCPCDCHGAJUU7BID7DOOKBTIWTRIYYZXGL2YBMJ64KNR53YJD4ANZE',
  splitterContractId:
    import.meta.env.VITE_SPLITTER_CONTRACT_ID ||
    'CCBQ4PWTSBKL6RTSL5CFUPVX3SZMLODDJKGH6XFVRZU6UPFXAHHZBSBR',
  ammContractId:
    import.meta.env.VITE_AMM_CONTRACT_ID ||
    'CD4B2YYEMDDRVOFH6EWIXFMP5ZX3YCLMALTYRTGSHCNXDDV3XWNIMILD',
  yieldSource: 'Mock yield token (demo, ~5% APY)',
  source: 'mock',
}

const blendMarket: MarketConfig = {
  key: 'blend',
  label: 'XLM · Blend',
  underlyingSymbol: 'XLM',
  // `||`, not `??` — see the same guard on musdyMarket's fields above: a
  // variable declared-but-blank in a hosting dashboard is an empty string, not
  // undefined, and `??` would let it through to point every Blend read/write
  // at an empty contract id.
  underlyingContractId:
    import.meta.env.VITE_BLEND_ASSET_ID ||
    'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  syVaultContractId: blendSyVault || 'CAWXCCBE7RY26LVVWN5QWWOARGDABGQKJMWAYPCM52TT5QZM2UCOGA7J',
  splitterContractId: blendSplitter || 'CDRDDE3NQAY5RPQ4KN7MRAOUTJTWITWLSZQWAFP4XRIN23VG7UHE6YOU',
  ammContractId: blendAmm || 'CBT5RSS37MYLQYEBOYM4GKWSY2MWKQW3RPUPRKQHUVZNKXLZ76TJED75',
  yieldSource: 'Blend lending pool (real Testnet yield)',
  source: 'blend',
  fundingHint: 'Fund the account with Friendbot — the underlying here is plain XLM.',
}

/**
 * Markets the app offers, most-default first. The Blend market only appears
 * when it is configured, so a mock-only deployment keeps working untouched.
 */
export const markets: readonly MarketConfig[] = [
  musdyMarket,
  ...(blendMarket.syVaultContractId && blendMarket.splitterContractId && blendMarket.ammContractId
    ? [blendMarket]
    : []),
]

/** True when the default market's contract IDs are configured (env wired). */
export function isContractsConfigured(): boolean {
  return (
    musdyMarket.underlyingContractId !== '' &&
    musdyMarket.syVaultContractId !== '' &&
    musdyMarket.splitterContractId !== ''
  )
}

/** Link to a transaction on stellar.expert (Testnet). */
export function explorerTxUrl(hash: string): string {
  return `${config.stellarExpertUrl}/tx/${hash}`
}

/** Link to a contract on stellar.expert (Testnet). */
export function explorerContractUrl(contractId: string): string {
  return `${config.stellarExpertUrl}/contract/${contractId}`
}
