import { defineConfig } from 'vitest/config'

// Standalone Vitest config (decoupled from vite.config.ts). The suite covers
// the pure, framework-agnostic modules under src/lib, so a node environment
// with no jsdom is all that's needed.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
