import { create } from 'zustand'
import { CountingSystemId } from '../engine/counting/types'
import type { CasinoRules } from '../engine/rules/types'
import { DEFAULT_RULES } from '../engine/rules/types'
import { soundEngine } from '../services/sound-engine'

const SOUND_SETTINGS_KEY = 'bjt_sound_settings'
const DEALING_SPEED_KEY = 'bjt_dealing_speed'

/**
 * Card-dealing speed presets for the casino table. Only two realistic paces are
 * offered — a "fast" mode was removed as unrealistic.
 */
export type DealingSpeed = 'slow' | 'normal'

/**
 * Multiplier applied to every animation delay. Higher = slower dealing.
 * `normal` (1.0) is the real casino baseline; `slow` gives more time to count.
 */
export const DEALING_SPEED_MULTIPLIER: Record<DealingSpeed, number> = {
  slow: 1.5,
  normal: 1.0,
}

/** Player-facing labels — a complete pair that reads well without a "Fast". */
export const DEALING_SPEED_LABEL: Record<DealingSpeed, string> = {
  slow: 'casino.hud.speedRelaxed',
  normal: 'casino.hud.speedStandard',
}

/** Load persisted dealing speed. Defaults to slow (more time to count). */
function loadDealingSpeed(): DealingSpeed {
  try {
    const s = localStorage.getItem(DEALING_SPEED_KEY)
    if (s === 'slow' || s === 'normal') return s
  } catch { /* ignore */ }
  return 'slow'
}

/** Load persisted sound settings from localStorage. */
function loadSoundSettings(): { enabled: boolean; volume: number } {
  try {
    const raw = localStorage.getItem(SOUND_SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
        volume: typeof parsed.volume === 'number' ? parsed.volume : 0.3,
      }
    }
  } catch { /* ignore */ }
  return { enabled: true, volume: 0.15 }
}

/** Persist sound settings to localStorage. */
function saveSoundSettings(enabled: boolean, volume: number): void {
  try {
    localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify({ enabled, volume }))
  } catch { /* ignore */ }
}

/** Available training modes in the app. */
export type AppMode =
  | 'home'
  | 'speedDrill'
  | 'deviationTraining'
  | 'betSpread'
  | 'deckEstimation'
  | 'analytics'
  | 'bankrollSim'
  | 'achievements'
  | 'casinoSession'
  | 'strategyChart'
  | 'casinoSessionTracker'
  | 'learn'
  | 'plan'

/** App-level state for navigation and global settings. */
export interface AppStoreState {
  currentMode: AppMode
  selectedSystem: CountingSystemId
  selectedRules: CasinoRules
  soundEnabled: boolean
  soundVolume: number
  dealingSpeed: DealingSpeed
}

export interface AppStoreActions {
  setMode: (mode: AppMode) => void
  setSystem: (system: CountingSystemId) => void
  setRules: (rules: CasinoRules) => void
  toggleSound: () => void
  setSoundVolume: (v: number) => void
  setDealingSpeed: (speed: DealingSpeed) => void
}

export type AppStore = AppStoreState & AppStoreActions

// Initialize soundEngine from persisted settings
const initialSound = loadSoundSettings()
soundEngine.enabled = initialSound.enabled
soundEngine.volume = initialSound.volume

/**
 * Zustand store for app-level navigation and global settings.
 *
 * Controls which training mode is active and which counting system / rules
 * are selected across all modes.
 */
export const useAppStore = create<AppStore>((set, get) => ({
  currentMode: 'home',
  selectedSystem: CountingSystemId.HiLo,
  selectedRules: DEFAULT_RULES,
  soundEnabled: initialSound.enabled,
  soundVolume: initialSound.volume,
  dealingSpeed: loadDealingSpeed(),

  setMode: (mode) => set({ currentMode: mode }),
  setSystem: (system) => set({ selectedSystem: system }),
  setRules: (rules) => set({ selectedRules: rules }),

  toggleSound: () => {
    const next = !get().soundEnabled
    soundEngine.enabled = next
    saveSoundSettings(next, get().soundVolume)
    set({ soundEnabled: next })
  },

  setSoundVolume: (v) => {
    const clamped = Math.max(0, Math.min(1, v))
    soundEngine.volume = clamped
    saveSoundSettings(get().soundEnabled, clamped)
    set({ soundVolume: clamped })
  },

  setDealingSpeed: (speed) => {
    try { localStorage.setItem(DEALING_SPEED_KEY, speed) } catch { /* ignore */ }
    set({ dealingSpeed: speed })
  },
}))
