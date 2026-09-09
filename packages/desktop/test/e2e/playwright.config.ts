import { defineConfig } from '@playwright/test'

export default defineConfig({
  // Electron tests are isolated per file and the CI runner has enough CPU
  // for two workers. Keep this explicit so runtime does not depend on the
  // runner's default worker calculation.
  workers: 2,
  testMatch: '**/*.spec.ts',
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 }
  },
  timeout: 30000
})
