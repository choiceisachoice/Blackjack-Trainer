import { create } from 'zustand'

/**
 * Tiny global controller for the Pro upgrade modal, so any gated surface can
 * open the same paywall without each one owning its own modal state.
 */
interface UpgradePromptStore {
  open: boolean
  /** Optional context line shown on the paywall (e.g. the locked feature). */
  headline: string | null
  show(headline?: string): void
  hide(): void
}

export const useUpgradePrompt = create<UpgradePromptStore>((set) => ({
  open: false,
  headline: null,
  show: (headline) => set({ open: true, headline: headline ?? null }),
  hide: () => set({ open: false, headline: null }),
}))
