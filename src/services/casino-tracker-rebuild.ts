import type { TrainingSessionResult } from './stats-types'
import type { TrackedCasinoSession } from '../store/casino-session-tracker-store'

/**
 * Rebuild the Casino Session Tracker from sessions that came back from the cloud.
 *
 * ## Why this exists
 *
 * Four things sync: `training_sessions`, `user_achievements`, `bankroll_sessions`
 * and `profiles`. The Casino Session Tracker was not among them — it lived only
 * in `localStorage` under `bjt_casino_session_tracker`, and `clearLocalAppData`
 * wipes every `bjt_*` key on sign-out. That wipe is a **security boundary** and
 * has to stay: without it the next person to sign in on this machine inherits
 * the previous one's data. But everything else it wipes comes back from the
 * cloud, and this did not. Signing out destroyed a log of real-money bankroll
 * figures, silently and for good.
 *
 * The honest fix would be a fifth synced table, which is a schema change on a
 * production database. It turns out not to be needed: `training_sessions.details`
 * is `jsonb`, so the three figures the tracker needs and the session record did
 * not carry — the opening and closing bankroll, and the table configuration —
 * cost nothing but three optional fields. Everything else the tracker shows is
 * already in the synced row.
 *
 * ## What cannot be rebuilt
 *
 * Sessions recorded before those fields existed have no bankroll figures, and
 * this **skips** them rather than filling in zeros. A tracker chart is a money
 * chart; a fabricated starting balance would be worse than a shorter history,
 * because it would look exactly as authoritative as a real one.
 */

/** A synced session that carries everything the tracker needs. */
function isRebuildable(
  result: TrainingSessionResult
): result is TrainingSessionResult & {
  details: Extract<TrainingSessionResult['details'], { type: 'casinoSession' }> & {
    startingBankroll: number
    finalBankroll: number
  }
} {
  const d = result.details
  return (
    d?.type === 'casinoSession' &&
    typeof d.startingBankroll === 'number' &&
    typeof d.finalBankroll === 'number'
  )
}

/** `YYYY-MM-DD` in local time, the format the tracker groups by. */
function localDateKey(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Tracker rows for every casino session in `results` that carries bankroll data.
 *
 * Pure, and sorted oldest first so the bankroll curve reads left to right.
 *
 * @param results - Session results, typically straight from the cloud
 */
export function rebuildTrackedSessions(
  results: readonly TrainingSessionResult[]
): TrackedCasinoSession[] {
  return results
    .filter(isRebuildable)
    .map(r => ({
      id: r.id,
      date: localDateKey(r.timestamp),
      timestamp: Date.parse(r.timestamp),
      handsPlayed: r.details.handsPlayed,
      duration: r.durationSeconds,
      startingBankroll: r.details.startingBankroll,
      finalBankroll: r.details.finalBankroll,
      profit: r.details.netProfit,
      betAccuracy: r.details.betAccuracy,
      playAccuracy: r.details.playAccuracy,
      countAccuracy: r.details.countAccuracy,
      overallScore: r.details.overallScore,
      grade: r.details.grade,
      numBots: r.details.numBots,
      config: r.details.tableConfig ?? { numDecks: 6, minBet: 0, blackjackPays: 1.5 },
    }))
    .sort((a, b) => a.timestamp - b.timestamp)
}

/**
 * Merge rebuilt rows into whatever is already tracked locally, by id.
 *
 * Local wins on a conflict, the same rule the bankroll sync uses: an edit made
 * on this device is the newer fact, and the rebuilt row is only a reconstruction
 * of what the cloud saw.
 *
 * @param local - Rows currently in the tracker
 * @param rebuilt - Rows derived from cloud sessions
 */
export function mergeTrackedSessions(
  local: readonly TrackedCasinoSession[],
  rebuilt: readonly TrackedCasinoSession[]
): TrackedCasinoSession[] {
  const byId = new Map<string, TrackedCasinoSession>()
  for (const s of rebuilt) byId.set(s.id, s)
  for (const s of local) byId.set(s.id, s)
  return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp)
}
