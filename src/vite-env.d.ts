/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HORIZON_URL?: string
  readonly VITE_FRIENDBOT_URL?: string
  readonly VITE_STELLAR_EXPERT_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
