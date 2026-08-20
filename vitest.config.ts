import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
    // Longer than the 5s `waitFor` budget that App/LandingPage/AccountPage each
    // set for themselves, and deliberately so. Those files render large trees
    // and decided — with a written rationale — that a wait past one second is
    // slow rather than broken. But the default test timeout is *also* 5s, so
    // their waits could never actually elapse: the test was killed first, and
    // the failure read "timed out" instead of naming the assertion that did not
    // hold. Raising the outer bound is what makes those inner budgets mean
    // something. A test that genuinely hangs now takes 15s to say so.
    testTimeout: 15_000,
    // Never let tests pick up real Supabase creds from .env.local — force the
    // app into its "unconfigured" (offline, no login gate) mode for all tests.
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
    coverage: {
      provider: 'v8',
    },
  },
})
