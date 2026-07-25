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
}

/**
 * Resolved configuration. Reads VITE_-prefixed env vars and falls back to the
 * Testnet defaults so the app works with zero local setup.
 */
export const config: AppConfig = {
  horizonUrl: import.meta.env.VITE_HORIZON_URL ?? 'https://horizon-testnet.stellar.org',
  friendbotUrl: import.meta.env.VITE_FRIENDBOT_URL ?? 'https://friendbot.stellar.org',
  stellarExpertUrl:
    import.meta.env.VITE_STELLAR_EXPERT_URL ?? 'https://stellar.expert/explorer/testnet',
  networkPassphrase: Networks.TESTNET,
  sorobanRpcUrl: import.meta.env.VITE_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org',
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
  // works with zero config; override via env for a fresh deployment.
  underlyingContractId:
    import.meta.env.VITE_MYT_CONTRACT_ID ??
    'CDQT4AHF5JLEQ2CXFXNBAGMTIJLS2UIEYCHQ6NICKBT5TFW54YI5IANU',
  syVaultContractId:
    import.meta.env.VITE_SY_VAULT_CONTRACT_ID ??
    'CDXY2JXPIBQMSTOTK62JLWT4HULABSBX7BQCFCWOFYUKWXZY6EIVA5OJ',
  splitterContractId:
    import.meta.env.VITE_SPLITTER_CONTRACT_ID ??
    'CARHO56HXKHT5FYBD7R7N2FPE5UFEMEXI3WYA4KV3ILR73PCZYBCZVNU',
  ammContractId:
    import.meta.env.VITE_AMM_CONTRACT_ID ??
    'CAQHWGN6XRZ2X77TE634LRIQTYNISU6BXJFDPFSKREA473NJUA5MG5J4',
  yieldSource: 'Mock yield token (demo, ~5% APY)',
  source: 'mock',
}

const blendMarket: MarketConfig = {
  key: 'blend',
  label: 'XLM · Blend',
  underlyingSymbol: 'XLM',
  underlyingContractId:
    import.meta.env.VITE_BLEND_ASSET_ID ??
    'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  syVaultContractId: blendSyVault || 'CBPRDRODB4W5NI2RBPAQ7ZFCFULQ5RCQOGSNEEXJ7GUCBKXTUIFYQZ3B',
  splitterContractId: blendSplitter || 'CCAWWK3C2JNOXFTNS6AUZLQTPZARW2ETK4JQ2UOTS35UNCU2OSTYJD6O',
  ammContractId: blendAmm || 'CD5PDFVVUK746ZDB72463YM7JTD3UXTZ4RN34CRJRYW3G7CEKWIZ4W2J',
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
