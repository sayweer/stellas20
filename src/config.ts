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
  /** Deployed MockYieldToken (mUSDY) contract ID on Testnet. */
  readonly mytContractId: string
  /** Deployed SYVault contract ID on Testnet. */
  readonly syVaultContractId: string
  /** Deployed Splitter contract ID on Testnet. */
  readonly splitterContractId: string
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
  // Default to the current Testnet deployment (public, non-secret) so the app
  // works with zero config; override via env for a fresh deployment.
  mytContractId:
    import.meta.env.VITE_MYT_CONTRACT_ID ??
    'CAJT453ZKZSTJFT6P2FLSPXPYOF4DGKMJHU4TW26KTRRIPR5VMCIYRJZ',
  syVaultContractId:
    import.meta.env.VITE_SY_VAULT_CONTRACT_ID ??
    'CC35NY2BXCLVHCCQ4EURDMT564YG2QG4VUVVX62Z2QDMZ6CGTQWRQI7U',
  splitterContractId:
    import.meta.env.VITE_SPLITTER_CONTRACT_ID ??
    'CCEGP3NOJCBXF2XUJECAUIYUDVVXS3ZPIRYUJ4TMF2IA4NRZCGCAZNMF',
}

/** True when all three contract IDs are configured (env fully wired). */
export function isContractsConfigured(): boolean {
  return (
    config.mytContractId !== '' &&
    config.syVaultContractId !== '' &&
    config.splitterContractId !== ''
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
