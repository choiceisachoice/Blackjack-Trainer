import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Types ────────────────────────────────────────────────────────────

/** A single tracked casino training session entry (auto-recorded). */
export interface TrackedCasinoSession {
  /** Unique identifier */
  id: string
  /** Date string "YYYY-MM-DD" */
  date: string
  /** Timestamp for sorting (ms since epoch) */
  timestamp: number
  /** Number of hands played */
  handsPlayed: number
  /** Duration in seconds */
  duration: number
  /** Bankroll at start of session */
  startingBankroll: number
  /** Bankroll at end of session */
  finalBankroll: number
  /** Net profit (finalBankroll - startingBankroll) */
  profit: number
  /** Betting accuracy 0-100 */
  betAccuracy: number
  /** Play accuracy 0-100 */
  playAccuracy: number
  /** Count accuracy 0-100 */
  countAccuracy: number
  /** Weighted overall score 0-100 */
  overallScore: number
  /** Letter grade ("A+", "A", "B+" etc.) */
  grade: string
  /** Number of bots at table */
  numBots: number
  /** Session config snapshot */
  config: {
    numDecks: number
    minBet: number
    blackjackPays: number
  }
}

// ── Personal Records ─────────────────────────────────────────────────

/** Personal records computed from tracked casino sessions. */
export interface CasinoSessionRecords {
  bestSession: TrackedCasinoSession | null
  worstSession: TrackedCasinoSession | null
  bestScore: TrackedCasinoSession | null
  bestGrade: string
  longestWinStreak: number
  longestLossStreak: number
  highestBankroll: number
  lowestBankroll: number
  longestSession: TrackedCasinoSession | null
  avgBetAccuracy: number
  avgPlayAccuracy: number
  avgCountAccuracy: number
  totalHandsPlayed: number
}

const EMPTY_RECORDS: CasinoSessionRecords = {
  bestSession: null,
  worstSession: null,
  bestScore: null,
  bestGrade: '',
  longestWinStreak: 0,
  longestLossStreak: 0,
  highestBankroll: 0,
  lowestBankroll: 0,
  longestSession: null,
  avgBetAccuracy: 0,
  avgPlayAccuracy: 0,
  avgCountAccuracy: 0,
  totalHandsPlayed: 0,
}

// ── Grade ordering for comparisons ───────────────────────────────────

const GRADE_ORDER: Record<string, number> = {
  'A+': 7, 'A': 6, 'B+': 5, 'B': 4, 'C': 3, 'D': 2, 'F': 1,
}

function gradeRank(grade: string): number {
  return GRADE_ORDER[grade] ?? 0
}

// ── Store Interface ──────────────────────────────────────────────────

interface CasinoSessionTrackerStore {
  sessions: TrackedCasinoSession[]
  startingBankroll: number

  // Actions
  addSession(session: TrackedCasinoSession): void
  /**
   * Replace the tracked set wholesale.
   *
   * Used by the sign-in sync to put back what `clearLocalAppData` wiped, which
   * it can now do because the bankroll figures ride along in the synced
   * session record. See `services/casino-tracker-rebuild.ts`.
   */
  hydrate(sessions: TrackedCasinoSession[]): void
  setStartingBankroll(amount: number): void
  deleteSession(id: string): void
  reset(): void

  // Computed helpers
  getCurrentBankroll(): number
  getTotalProfit(): number
  getTotalHours(): number
  getWinRate(): number
  getAvgPerHour(): number
  getAvgScore(): number
  getBestSession(): TrackedCasinoSession | null
  getWorstSession(): TrackedCasinoSession | null
  getSessionCount(): number
  getWinningStreak(): number
  getLosingStreak(): number
  getTotalHands(): number
  getPersonalRecords(): CasinoSessionRecords
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Compute the longest consecutive streak of a predicate over sessions sorted by date.
 */
function longestStreak(sessions: TrackedCasinoSession[], predicate: (s: TrackedCasinoSession) => boolean): number {
  const sorted = [...sessions].sort((a, b) => a.timestamp - b.timestamp)
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

export const useCasinoSessionTrackerStore = create<CasinoSessionTrackerStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      startingBankroll: 0,

      addSession(session) {
        set(state => ({ sessions: [...state.sessions, session] }))
      },

      hydrate(sessions) {
        set({ sessions })
      },

      setStartingBankroll(amount) {
        set({ startingBankroll: amount })
      },

      deleteSession(id) {
        set(state => ({
          sessions: state.sessions.filter(s => s.id !== id),
        }))
      },

      reset() {
        set({ sessions: [], startingBankroll: 0 })
      },

      getCurrentBankroll() {
        const { startingBankroll, sessions } = get()
        return startingBankroll + sessions.reduce((sum, s) => sum + s.profit, 0)
      },

      getTotalProfit() {
        return get().sessions.reduce((sum, s) => sum + s.profit, 0)
      },

      getTotalHours() {
        return get().sessions.reduce((sum, s) => sum + s.duration, 0) / 3600
      },

      getWinRate() {
        const { sessions } = get()
        if (sessions.length === 0) return 0
        const wins = sessions.filter(s => s.profit > 0).length
        return wins / sessions.length
      },

      getAvgPerHour() {
        const totalProfit = get().getTotalProfit()
        const totalHours = get().getTotalHours()
        if (totalHours === 0) return 0
        return totalProfit / totalHours
      },

      getAvgScore() {
        const { sessions } = get()
        if (sessions.length === 0) return 0
        return sessions.reduce((sum, s) => sum + s.overallScore, 0) / sessions.length
      },

      getBestSession() {
        const { sessions } = get()
        if (sessions.length === 0) return null
        return sessions.reduce((best, s) => s.profit > best.profit ? s : best)
      },

      getWorstSession() {
        const { sessions } = get()
        if (sessions.length === 0) return null
        return sessions.reduce((worst, s) => s.profit < worst.profit ? s : worst)
      },

      getSessionCount() {
        return get().sessions.length
      },

      getWinningStreak() {
        return longestStreak(get().sessions, s => s.profit > 0)
      },

      getLosingStreak() {
        return longestStreak(get().sessions, s => s.profit < 0)
      },

      getTotalHands() {
        return get().sessions.reduce((sum, s) => sum + s.handsPlayed, 0)
      },

      getPersonalRecords() {
        const { sessions, startingBankroll } = get()
        if (sessions.length === 0) return EMPTY_RECORDS

        const sorted = [...sessions].sort((a, b) => a.timestamp - b.timestamp)

        // Highest/lowest bankroll
        let runningBankroll = startingBankroll
        let highest = startingBankroll
        let lowest = startingBankroll
        for (const s of sorted) {
          runningBankroll += s.profit
          if (runningBankroll > highest) highest = runningBankroll
          if (runningBankroll < lowest) lowest = runningBankroll
        }

        // Win/Loss streaks
        let maxWin = 0, maxLoss = 0, curWin = 0, curLoss = 0
        for (const s of sorted) {
          if (s.profit > 0) {
            curWin++; curLoss = 0
            if (curWin > maxWin) maxWin = curWin
          } else if (s.profit < 0) {
            curLoss++; curWin = 0
            if (curLoss > maxLoss) maxLoss = curLoss
          } else {
            curWin = 0; curLoss = 0
          }
        }

        // Best score session
        const bestScore = [...sessions].sort((a, b) => b.overallScore - a.overallScore)[0]

        // Best grade
        const bestGradeSession = [...sessions].sort((a, b) => gradeRank(b.grade) - gradeRank(a.grade))[0]

        // Longest session by hands played
        const longestSession = [...sessions].sort((a, b) => b.handsPlayed - a.handsPlayed)[0]

        // Average accuracies
        const avgBetAccuracy = sessions.reduce((s, x) => s + x.betAccuracy, 0) / sessions.length
        const avgPlayAccuracy = sessions.reduce((s, x) => s + x.playAccuracy, 0) / sessions.length
        const avgCountAccuracy = sessions.reduce((s, x) => s + x.countAccuracy, 0) / sessions.length

        return {
          bestSession: [...sessions].sort((a, b) => b.profit - a.profit)[0],
          worstSession: [...sessions].sort((a, b) => a.profit - b.profit)[0],
          bestScore,
          bestGrade: bestGradeSession?.grade ?? '',
          longestWinStreak: maxWin,
          longestLossStreak: maxLoss,
          highestBankroll: highest,
          lowestBankroll: lowest,
          longestSession,
          avgBetAccuracy,
          avgPlayAccuracy,
          avgCountAccuracy,
          totalHandsPlayed: sessions.reduce((s, x) => s + x.handsPlayed, 0),
        }
      },
    }),
    {
      name: 'bjt_casino_session_tracker',
    },
  ),
)
