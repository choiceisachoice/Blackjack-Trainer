import { create } from 'zustand'
import { CountingSystemId } from '../engine/counting/types'
import type { CasinoRules } from '../engine/rules/types'
import { DEFAULT_RULES } from '../engine/rules/types'

/** Available training modes in the app. */
export type AppMode =
  | 'home'
  | 'speedDrill'
  | 'tableCounting'
  | 'deviationTraining'
  | 'betSpread'
  | 'deckEstimation'
  | 'analytics'

/** App-level state for navigation and global settings. */
export interface AppStoreState {
  currentMode: AppMode
  selectedSystem: CountingSystemId
  selectedRules: CasinoRules
}

export interface AppStoreActions {
  setMode: (mode: AppMode) => void
  setSystem: (system: CountingSystemId) => void
  setRules: (rules: CasinoRules) => void
}

export type AppStore = AppStoreState & AppStoreActions

/**
 * Zustand store for app-level navigation and global settings.
 *
 * Controls which training mode is active and which counting system / rules
 * are selected across all modes.
 */
export const useAppStore = create<AppStore>((set) => ({
  currentMode: 'home',
  selectedSystem: CountingSystemId.HiLo,
  selectedRules: DEFAULT_RULES,

  setMode: (mode) => set({ currentMode: mode }),
  setSystem: (system) => set({ selectedSystem: system }),
  setRules: (rules) => set({ selectedRules: rules }),
}))
