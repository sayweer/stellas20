import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    /**
     * Sentry only ever receives failures we could not classify, so every event
     * it does get is worth reading — and without maps each one points at
     * minified names. The repo is public, so publishing the maps alongside the
     * bundle costs nothing and lets Sentry fetch them straight from the deploy.
     */
    sourcemap: true,
    rollupOptions: {
      output: {
        /**
         * Split the SDK out of the app bundle. It is by far the largest input
         * and it only changes when the dependency is upgraded, so keeping it in
         * its own chunk means a UI change no longer invalidates ~700 kB of
         * cached vendor code for returning visitors.
         */
        manualChunks(id: string): string | undefined {
          // WalletConnect/AppKit is only imported dynamically, and only when a
          // project id is configured. It must be matched *before* the kit rule
          // below, otherwise it lands in the eager `stellar` chunk and every
          // visitor downloads ~1.4 MB they will never execute.
          if (
            id.includes('@reown') ||
            id.includes('@walletconnect') ||
            id.includes('wallet-connect')
          ) {
            return undefined
          }
          if (id.includes('@stellar/stellar-sdk') || id.includes('@creit.tech/stellar-wallets-kit')) {
            return 'stellar'
          }
          // GSAP drives the marketing page only. Keeping it out of the shared
          // chunk means visitors who land straight on /app never download it.
          if (id.includes('node_modules/gsap')) {
            return 'gsap'
          }
          return undefined
        },
      },
    },
  },
})
