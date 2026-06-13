import { create } from 'zustand'
import { CountingSystemId } from '../engine/counting/types'
import type { CasinoRules } from '../engine/rules/types'
import { DEFAULT_RULES } from '../engine/rules/types'
import { soundEngine } from '../services/sound-engine'

const SOUND_SETTINGS_KEY = 'bjt_sound_settings'
const THEME_KEY = 'bjt_theme'

/** Supported theme modes. */
export type ThemeMode = 'dark' | 'light'

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

/** Load persisted theme, falling back to system preference then dark. */
function loadTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch { /* ignore */ }
  // System preference detection for first visit
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light'
  }
  return 'dark'
}

/** Apply theme to the document root element. */
function applyTheme(theme: ThemeMode): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

/** Available training modes in the app. */
export type AppMode =
  | 'home'
  | 'speedDrill'
  | 'tableCounting'
  | 'deviationTraining'
  | 'betSpread'
  | 'deckEstimation'
  | 'analytics'
  | 'bankrollSim'
  | 'achievements'
  | 'casinoSession'
  | 'strategyChart'
  | 'casinoSessionTracker'

/** App-level state for navigation and global settings. */
export interface AppStoreState {
  currentMode: AppMode
  selectedSystem: CountingSystemId
  selectedRules: CasinoRules
  soundEnabled: boolean
  soundVolume: number
  theme: ThemeMode
}

export interface AppStoreActions {
  setMode: (mode: AppMode) => void
  setSystem: (system: CountingSystemId) => void
  setRules: (rules: CasinoRules) => void
  toggleSound: () => void
  setSoundVolume: (v: number) => void
  toggleTheme: () => void
  setTheme: (theme: ThemeMode) => void
}

export type AppStore = AppStoreState & AppStoreActions

// Initialize soundEngine from persisted settings
const initialSound = loadSoundSettings()
soundEngine.enabled = initialSound.enabled
soundEngine.volume = initialSound.volume

// Initialize theme
const initialTheme = loadTheme()
applyTheme(initialTheme)

/**
 * Zustand store for app-level navigation and global settings.
 *
 * Controls which training mode is active and which counting system / rules
 * are selected across all modes. Also manages theme (dark/light).
 */
export const useAppStore = create<AppStore>((set, get) => ({
  currentMode: 'home',
  selectedSystem: CountingSystemId.HiLo,
  selectedRules: DEFAULT_RULES,
  soundEnabled: initialSound.enabled,
  soundVolume: initialSound.volume,
  theme: initialTheme,

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

  toggleTheme: () => {
    const next: ThemeMode = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    try { localStorage.setItem(THEME_KEY, next) } catch { /* ignore */ }
    set({ theme: next })
  },

  setTheme: (theme) => {
    applyTheme(theme)
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* ignore */ }
    set({ theme })
  },
}))
