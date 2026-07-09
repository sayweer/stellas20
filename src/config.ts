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
  /** Deployed stellas-vault contract ID on Testnet. */
  readonly vaultContractId: string
  /** Native XLM Stellar Asset Contract ID on Testnet (the vault's token). */
  readonly nativeSacId: string
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
  vaultContractId: import.meta.env.VITE_VAULT_CONTRACT_ID ?? '',
  nativeSacId:
    import.meta.env.VITE_NATIVE_SAC_ID ?? 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
}

/** Link to a transaction on stellar.expert (Testnet). */
export function explorerTxUrl(hash: string): string {
  return `${config.stellarExpertUrl}/tx/${hash}`
}

/** Link to a contract on stellar.expert (Testnet). */
export function explorerContractUrl(contractId: string): string {
  return `${config.stellarExpertUrl}/contract/${contractId}`
}
