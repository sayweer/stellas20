import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
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
          return undefined
        },
      },
    },
  },
})
