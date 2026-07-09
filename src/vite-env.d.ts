/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HORIZON_URL?: string
  readonly VITE_FRIENDBOT_URL?: string
  readonly VITE_STELLAR_EXPERT_URL?: string
  readonly VITE_SOROBAN_RPC_URL?: string
  readonly VITE_VAULT_CONTRACT_ID?: string
  readonly VITE_NATIVE_SAC_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
