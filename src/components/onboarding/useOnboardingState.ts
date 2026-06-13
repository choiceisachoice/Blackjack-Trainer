import { create } from 'zustand'

const STORAGE_KEY = 'bjt_onboarding_seen'

interface OnboardingState {
  shouldShow: boolean
  isVisible: boolean
  markAsSeen: () => void
  resetOnboarding: () => void
}

/**
 * Shared Zustand store for onboarding trailer visibility.
 * Uses localStorage to persist whether the user has seen the intro.
 * Shared across components so HomeScreen's "Watch Intro" button
 * triggers App.tsx to show the trailer without a page reload.
 */
export const useOnboardingState = create<OnboardingState>((set) => ({
  shouldShow: !localStorage.getItem(STORAGE_KEY),
  isVisible: !localStorage.getItem(STORAGE_KEY),
  markAsSeen: () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    set({ shouldShow: false, isVisible: false })
  },
  resetOnboarding: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ shouldShow: true, isVisible: true })
  },
}))
