import type { TrainingSessionResult } from './stats-types'
import type { TrackedSession } from '../store/bankroll-tracker-store'
import { useStatsStore } from '../store/stats-store'
import { useAchievementStore } from '../store/achievement-store'
import { useLevelStore } from '../store/level-store'
import { useBankrollTrackerStore } from '../store/bankroll-tracker-store'

/**
 * Everything the app holds about a person, as one file.
 *
 * Data portability is a right under the DSG and the GDPR, and until this
 * existed the only way to exercise it was to write in. The shape is the app's
 * own — the session records as they are stored, the achievement ids, the XP
 * total and the real-money bankroll log — with a version so a later reader can
 * tell which shape it is looking at.
 */
export interface DataExport {
  app: 'blackjack-trainer'
  version: 1
  /** ISO timestamp of the export. */
  exportedAt: string
  /** The signed-in address, or null when there is no backend. */
  email: string | null
  level: { totalXP: number }
  /** Ids of unlocked achievements. */
  achievements: string[]
  sessions: TrainingSessionResult[]
  /** The real-money bankroll log. */
  bankroll: TrackedSession[]
}

/** What `buildDataExport` needs, so it can be tested without the stores. */
export interface DataExportInput {
  email: string | null
  totalXP: number
  achievements: string[]
  sessions: TrainingSessionResult[]
  bankroll: TrackedSession[]
  now: Date
}

/**
 * Assemble the export from its parts. Pure.
 *
 * @param input - The person's data and the export time
 * @returns The export document
 */
export function buildDataExport(input: DataExportInput): DataExport {
  return {
    app: 'blackjack-trainer',
    version: 1,
    exportedAt: input.now.toISOString(),
    email: input.email,
    level: { totalXP: input.totalXP },
    achievements: [...input.achievements],
    sessions: [...input.sessions],
    bankroll: [...input.bankroll],
  }
}

/**
 * The file name for an export made at `now` — dated, so two exports do not
 * overwrite each other in a downloads folder.
 *
 * @param now - The export time
 * @returns e.g. `blackjack-trainer-2026-09-11.json`
 */
export function exportFileName(now: Date): string {
  return `blackjack-trainer-${now.toISOString().slice(0, 10)}.json`
}

/**
 * Read the person's data out of the stores and build the export.
 *
 * @param email - The signed-in address, or null
 * @returns The export document, as of now
 */
export function collectDataExport(email: string | null): DataExport {
  return buildDataExport({
    email,
    totalXP: useLevelStore.getState().totalXP,
    achievements: useAchievementStore.getState().unlockedIds,
    sessions: useStatsStore.getState().sessions,
    bankroll: useBankrollTrackerStore.getState().sessions,
    now: new Date(),
  })
}

/**
 * Hand the browser a JSON file to save.
 *
 * An object URL rather than a data URI: a long training history is megabytes,
 * and a data URI of that size is copied into the href as a string first.
 *
 * @param name - The file name to suggest
 * @param data - The document to serialise
 */
export function downloadJson(name: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
