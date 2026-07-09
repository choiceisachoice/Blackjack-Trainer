import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAchievementStore } from './achievement-store'
import { pushSession, removeCloudSession } from '../services/supabase/bankroll-sync'

// ── Types ────────────────────────────────────────────────────────────

/** A single tracked casino session entry. */
export interface TrackedSession {
  /** Unique identifier */
  id: string
  /** Date string "YYYY-MM-DD" */
  date: string
  /** Casino name (free text) */
  casino: string
  /** Result in dollars: positive = win, negative = loss */
  result: number
  /** Duration in hours (e.g. 2.5) */
  hoursPlayed: number
  /** Optional notes */
  notes: string
  /** Timestamp when created */
  createdAt: number
}

// ── Personal Records ─────────────────────────────────────────────────

/** Personal records computed from tracked sessions. */
export interface PersonalRecords {
  bestSession: TrackedSession | null
  worstSession: TrackedSession | null
  longestWinStreak: number
  longestLossStreak: number
  highestBankroll: number
  lowestBankroll: number
  longestSession: TrackedSession | null
  bestHourlyRate: TrackedSession | null
  mostProfitableCasino: string | null
  totalWinningDays: number
}

const EMPTY_RECORDS: PersonalRecords = {
  bestSession: null,
  worstSession: null,
  longestWinStreak: 0,
  longestLossStreak: 0,
  highestBankroll: 0,
  lowestBankroll: 0,
  longestSession: null,
  bestHourlyRate: null,
  mostProfitableCasino: null,
  totalWinningDays: 0,
}

// ── Store Interface ──────────────────────────────────────────────────

interface BankrollTrackerStore {
  sessions: TrackedSession[]
  startingBankroll: number

  // Actions
  addSession(session: Omit<TrackedSession, 'id' | 'createdAt'>): void
  editSession(id: string, updates: Partial<Omit<TrackedSession, 'id' | 'createdAt'>>): void
  deleteSession(id: string): void
  setStartingBankroll(amount: number): void
  /** Replace all sessions (used when hydrating the merged set from the cloud). */
  hydrate(sessions: TrackedSession[]): void

  // Computed helpers
  getCurrentBankroll(): number
  getTotalProfit(): number
  getTotalHours(): number
  getWinRate(): number
  getAvgPerHour(): number
  getBestSession(): TrackedSession | null
  getWorstSession(): TrackedSession | null
  getSessionCount(): number
  getWinningStreak(): number
  getLosingStreak(): number
  getPersonalRecords(): PersonalRecords
}

// ── Helpers ──────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID()
}

/**
 * Compute the longest consecutive streak of a predicate over sessions sorted by date.
 */
function longestStreak(sessions: TrackedSession[], predicate: (s: TrackedSession) => boolean): number {
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
  let max = 0
  let current = 0
  for (const s of sorted) {
    if (predicate(s)) {
      current++
      if (current > max) max = current
    } else {
      current = 0
    }
  }
  return max
}

// ── Store ────────────────────────────────────────────────────────────

export const useBankrollTrackerStore = create<BankrollTrackerStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      startingBankroll: 0,

      addSession(session) {
        const newSession: TrackedSession = {
          ...session,
          id: generateId(),
          createdAt: Date.now(),
        }
        set(state => ({ sessions: [...state.sessions, newSession] }))
        pushSession(newSession)
        // Defer achievement check to next tick so localStorage is updated first
        setTimeout(() => useAchievementStore.getState().checkBankrollTrackerAchievements(), 0)
      },

      editSession(id, updates) {
        set(state => ({
          sessions: state.sessions.map(s =>
            s.id === id ? { ...s, ...updates } : s,
          ),
        }))
        const updated = get().sessions.find(s => s.id === id)
        if (updated) pushSession(updated)
        setTimeout(() => useAchievementStore.getState().checkBankrollTrackerAchievements(), 0)
      },

      deleteSession(id) {
        set(state => ({
          sessions: state.sessions.filter(s => s.id !== id),
        }))
        removeCloudSession(id)
      },

      setStartingBankroll(amount) {
        set({ startingBankroll: amount })
      },

      hydrate(sessions) {
        set({ sessions })
      },

      getCurrentBankroll() {
        const { startingBankroll, sessions } = get()
        return startingBankroll + sessions.reduce((sum, s) => sum + s.result, 0)
      },

      getTotalProfit() {
        return get().sessions.reduce((sum, s) => sum + s.result, 0)
      },

      getTotalHours() {
        return get().sessions.reduce((sum, s) => sum + s.hoursPlayed, 0)
      },

      getWinRate() {
        const { sessions } = get()
        if (sessions.length === 0) return 0
        const wins = sessions.filter(s => s.result > 0).length
        return wins / sessions.length
      },

      getAvgPerHour() {
        const totalProfit = get().getTotalProfit()
        const totalHours = get().getTotalHours()
        if (totalHours === 0) return 0
        return totalProfit / totalHours
      },

      getBestSession() {
        const { sessions } = get()
        if (sessions.length === 0) return null
        return sessions.reduce((best, s) => s.result > best.result ? s : best)
      },

      getWorstSession() {
        const { sessions } = get()
        if (sessions.length === 0) return null
        return sessions.reduce((worst, s) => s.result < worst.result ? s : worst)
      },

      getSessionCount() {
        return get().sessions.length
      },

      getWinningStreak() {
        return longestStreak(get().sessions, s => s.result > 0)
      },

      getLosingStreak() {
        return longestStreak(get().sessions, s => s.result < 0)
      },

      getPersonalRecords() {
        const { sessions, startingBankroll } = get()
        if (sessions.length === 0) return EMPTY_RECORDS

        const sorted = [...sessions].sort((a, b) =>
          a.date.localeCompare(b.date) || a.createdAt - b.createdAt)

        // Highest/lowest bankroll
        let runningBankroll = startingBankroll
        let highest = startingBankroll
        let lowest = startingBankroll
        for (const s of sorted) {
          runningBankroll += s.result
          if (runningBankroll > highest) highest = runningBankroll
          if (runningBankroll < lowest) lowest = runningBankroll
        }

        // Win/Loss streaks
        let maxWin = 0, maxLoss = 0, curWin = 0, curLoss = 0
        for (const s of sorted) {
          if (s.result > 0) {
            curWin++; curLoss = 0
            if (curWin > maxWin) maxWin = curWin
          } else {
            curLoss++; curWin = 0
            if (curLoss > maxLoss) maxLoss = curLoss
          }
        }

        // Best casino
        const casinoTotals: Record<string, number> = {}
        for (const s of sessions) {
          if (s.casino) {
            casinoTotals[s.casino] = (casinoTotals[s.casino] || 0) + s.result
          }
        }
        const bestCasino = Object.entries(casinoTotals)
          .sort(([, a], [, b]) => b - a)[0]?.[0] || null

        // Best $/hour session
        const bestHourly = [...sessions]
          .filter(s => s.hoursPlayed > 0)
          .sort((a, b) => (b.result / b.hoursPlayed) - (a.result / a.hoursPlayed))[0] || null

        return {
          bestSession: [...sessions].sort((a, b) => b.result - a.result)[0],
          worstSession: [...sessions].sort((a, b) => a.result - b.result)[0],
          longestWinStreak: maxWin,
          longestLossStreak: maxLoss,
          highestBankroll: highest,
          lowestBankroll: lowest,
          longestSession: [...sessions].sort((a, b) => b.hoursPlayed - a.hoursPlayed)[0],
          bestHourlyRate: bestHourly,
          mostProfitableCasino: bestCasino,
          totalWinningDays: sessions.filter(s => s.result > 0).length,
        }
      },
    }),
    {
      name: 'bjt_bankroll_tracker',
    },
  ),
)
