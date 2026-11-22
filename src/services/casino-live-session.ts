import { CASINO_SNAPSHOT_VERSION, parseSalvage, parseSnapshot } from '../engine/casino-session/session-snapshot'
import type { CasinoSessionSnapshot, SnapshotSalvage } from '../engine/casino-session/session-snapshot'
import type { CasinoSessionConfig } from '../engine/casino-session/types'
import { getLocalOwner } from './storage/local-owner'

/**
 * The casino table that is being played, kept on the device.
 *
 * ── Why ──
 * The table lived in memory only. A closed tab, a phone that died or a reload
 * took the shoe, the bankroll and every hand with it: nothing in the
 * statistics, no XP, and a fresh shoe on return. Only "Cash out" wrote a
 * session down.
 *
 * ── What is kept, and when ──
 * The whole table (`CasinoSessionEngine.snapshot()`), the session clock and a
 * little of the betting screen, written when the session starts, after every
 * settled hand, and — since a reload could otherwise take a hand back —
 * whenever cards leave the shoe during a hand. What comes back is always the
 * table at the betting step of the next hand.
 *
 * A hand that was in progress when the page died is not replayed. Its bet is
 * returned and its cards are burned: the copy written during the hand holds
 * the shoe, the cards dealt and the count as they stood with those cards out,
 * and the bankroll with the bets back in it (`voidOpenHand`). Before, the copy
 * predated the deal, so a reload put the same cards back on top of the shoe:
 * a losing hand could be looked at, reloaded away and dealt again.
 *
 * ── Whose it is ──
 * The record names its owner: the account the local data belonged to when it
 * was written (`getLocalOwner()`; null where there are no accounts — the
 * offline build). A table is only ever loaded for that owner. The key also
 * carries the `bjt_` prefix, so `clearLocalAppData` wipes it on sign-out; the
 * owner is what still holds when a wipe did not run.
 *
 * ── A record this build cannot read ──
 * It is left where it is. Every push to main deploys, and a build that
 * removed what it could not parse would take a player's hands with it. What
 * can be counted without being playable is recorded instead
 * (`loadSalvageableSession`, used by `salvageUnreadableSession`).
 */
export const LIVE_SESSION_KEY = 'bjt_casino_live'

/** The ids of sessions already written to the statistics; see `claimRecording`. */
export const RECORDED_IDS_KEY = 'bjt_casino_recorded'

/**
 * The shape of the stored record. Bumped when it changes; a record of another
 * version is not loaded — and not removed either.
 *
 * 2: the record carries its owner.
 */
export const LIVE_SESSION_VERSION = 2

/** A saved table nobody came back to for this long is cashed out for them. */
export const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000

/** How many recorded ids are remembered. One table is live at a time; this is generous. */
const RECORDED_IDS_KEPT = 50

/** What the betting screen held that the engine does not. */
export interface LiveSessionUi {
  /** The bets of the last round, by hand — offered again, as chips left on the spot. */
  lastBets: number[]
  /** The player chose to play on past the session's target. */
  keptPlaying: boolean
}

/** One table in progress, as it is stored. */
export interface SavedLiveSession {
  version: number
  /**
   * Made when the session starts and never changed. It is what makes recording
   * idempotent: the statistics row carries this id, and `claimRecording` hands
   * it out once.
   */
  id: string
  /**
   * The account the table belongs to, or null where there are no accounts.
   * Stamped by `saveLiveSession`; a record is loaded for its owner only.
   */
  owner: string | null
  /** The table. */
  snapshot: CasinoSessionSnapshot
  /** The table's rules — the same object as `snapshot.config`, for the setup screen. */
  config: CasinoSessionConfig
  /** The session clock at the moment of saving, pauses excluded. */
  elapsedSeconds: number
  /** When this copy was written (ms since epoch): the time of the last settled hand. */
  savedAt: number
  ui: LiveSessionUi
}

/** What the resume card says about a saved table. */
export interface LiveSessionSummary {
  id: string
  /** The number of the last hand dealt — the figure the table's own bar shows. */
  handNumber: number
  /** Hands finished and recorded. Zero means there is nothing to cash out. */
  handsPlayed: number
  bankroll: number
  savedAt: number
  /** The saved table is the free trial's, not a Pro table. */
  trial: boolean
}

/** A fresh id for a session that is starting. A uuid: the statistics table keys on one. */
export function newLiveSessionId(): string {
  return crypto.randomUUID()
}

function readRecordedIds(): string[] {
  try {
    const raw = localStorage.getItem(RECORDED_IDS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

/** Whether a session with this id has already been written to the statistics. */
export function isRecorded(id: string): boolean {
  return readRecordedIds().includes(id)
}

/**
 * Write the table to the device.
 *
 * Never throws. A full quota, private browsing or a serialisation error must
 * not reach the table — the hand that was just settled is settled either way,
 * and the worst case is the one that existed before any of this: an older copy
 * (or none) on the device.
 *
 * A session that has already been recorded is not written again. Without that
 * a second tab still sitting at the table would put the session back after the
 * first had cashed it out, and it would be offered a second time.
 *
 * The owner is not the caller's to choose: it is whoever the local data
 * belongs to at this moment.
 *
 * @returns Whether the copy on the device is now this one
 */
export function saveLiveSession(session: Omit<SavedLiveSession, 'version' | 'owner'>): boolean {
  try {
    if (isRecorded(session.id)) return false
    localStorage.setItem(LIVE_SESSION_KEY, JSON.stringify({
      ...session,
      owner: getLocalOwner(),
      version: LIVE_SESSION_VERSION,
    }))
    return true
  } catch {
    return false
  }
}

/**
 * Read the saved table, if there is one that can be trusted and is ours.
 *
 * A record this build cannot read — another version, cut short, edited — is
 * NOT removed. It used to be, and every deploy that changed the record's
 * shape would have deleted the hands of whoever was mid-table. It is simply
 * not a table that can be continued; `loadSalvageableSession` reads what can
 * still be written down.
 *
 * Nor is a record that belongs to another account: it is not ours to delete.
 *
 * Only a table whose session has already been recorded is removed.
 */
export function loadLiveSession(): SavedLiveSession | null {
  const raw = readRaw()
  if (raw === null) return null
  const session = parseSaved(raw)
  if (!session || session.owner !== getLocalOwner()) return null
  if (isRecorded(session.id)) {
    clearLiveSession(session.id)
    return null
  }
  return session
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(LIVE_SESSION_KEY)
  } catch {
    return null
  }
}

const isOwner = (v: unknown): v is string | null => v === null || (typeof v === 'string' && v.length > 0)

function parseSaved(raw: string): SavedLiveSession | null {
  try {
    const data = JSON.parse(raw) as Partial<SavedLiveSession> | null
    if (typeof data !== 'object' || data === null) return null
    if (data.version !== LIVE_SESSION_VERSION) return null
    if (typeof data.id !== 'string' || data.id.length === 0) return null
    // No owner field at all is not "nobody's": it is a record of another shape.
    if (!('owner' in data) || !isOwner(data.owner)) return null
    if (!isCount(data.elapsedSeconds) || !isCount(data.savedAt)) return null
    const snapshot = parseSnapshot(data.snapshot)
    if (!snapshot) return null
    const ui = data.ui
    const lastBets = Array.isArray(ui?.lastBets) ? ui.lastBets.filter(isCount) : []
    return {
      version: LIVE_SESSION_VERSION,
      id: data.id,
      owner: data.owner,
      snapshot,
      config: snapshot.config,
      elapsedSeconds: Math.floor(data.elapsedSeconds),
      savedAt: data.savedAt,
      ui: { lastBets, keptPlaying: ui?.keptPlaying === true },
    }
  } catch {
    return null
  }
}

/** A saved table that cannot be continued, as far as it can still be written down. */
export interface SalvageableLiveSession extends SnapshotSalvage {
  id: string
  elapsedSeconds: number
  savedAt: number
}

/**
 * Read what can be recorded of a saved table this build cannot continue.
 *
 * Null for a table that loads normally (it needs no salvage), for one of
 * another account, and for one written by a NEWER build than this — that is
 * another tab on a fresher deploy, possibly still playing it. Null as well
 * when any figure a session result needs is missing: nothing is invented.
 */
export function loadSalvageableSession(): SalvageableLiveSession | null {
  const raw = readRaw()
  if (raw === null || parseSaved(raw) !== null) return null
  try {
    const data = JSON.parse(raw) as Record<string, unknown> | null
    if (typeof data !== 'object' || data === null) return null
    if (typeof data.id !== 'string' || data.id.length === 0) return null
    if (!('owner' in data) || data.owner !== getLocalOwner()) return null
    if (typeof data.version !== 'number' || data.version > LIVE_SESSION_VERSION) return null
    if (!isCount(data.elapsedSeconds) || !isCount(data.savedAt)) return null
    const salvage = parseSalvage(data.snapshot)
    if (!salvage || salvage.version > CASINO_SNAPSHOT_VERSION) return null
    return { ...salvage, id: data.id, elapsedSeconds: Math.floor(data.elapsedSeconds), savedAt: data.savedAt }
  } catch {
    return null
  }
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/**
 * Remove the saved table.
 *
 * @param id - When given, only a table with this id is removed. A tab whose
 *   session has ended must not delete the table another tab started since.
 */
export function clearLiveSession(id?: string): void {
  try {
    if (id !== undefined) {
      const raw = localStorage.getItem(LIVE_SESSION_KEY)
      if (raw === null) return
      // A record whose id cannot be read at all is nobody's: it goes too.
      const readable = parseId(raw)
      if (readable !== null && readable !== id) return
    }
    localStorage.removeItem(LIVE_SESSION_KEY)
  } catch { /* nothing to remove, or no storage: the same thing */ }
}

function parseId(raw: string): string | null {
  try {
    const data = JSON.parse(raw) as { id?: unknown } | null
    return data && typeof data.id === 'string' ? data.id : null
  } catch {
    return null
  }
}

/**
 * Take the one right to record this session.
 *
 * Returns true exactly once per id; every later call — the same click twice, a
 * second tab, the automatic cash-out racing a manual one — gets false and must
 * not record. The saved table is removed in the same breath, so "recorded" and
 * "still offered for resuming" cannot both be true.
 *
 * The order matters: the id goes on the list *before* the table is removed.
 * If the page dies between the two, the table is still there but can no
 * longer be recorded or saved over, and `loadLiveSession` drops it.
 *
 * `localStorage` has no transaction. Two tabs that both read the list in the
 * same instant could both be told yes; that window is two synchronous calls
 * wide. The statistics row carries the session id as its own id for that
 * case: the store refuses a second row with it, and the cloud upserts on it.
 *
 * @param id - The live session's id
 */
export function claimRecording(id: string): boolean {
  try {
    const ids = readRecordedIds()
    if (ids.includes(id)) return false
    localStorage.setItem(RECORDED_IDS_KEY, JSON.stringify([...ids, id].slice(-RECORDED_IDS_KEPT)))
  } catch {
    // No storage to keep the list in: there is also no saved table and no
    // second tab reading one. The session in memory is recorded once by its
    // own guard (`endedRef` in the game loop).
    return true
  }
  clearLiveSession(id)
  return true
}

/** The few figures the resume card shows. */
export function summarize(session: SavedLiveSession): LiveSessionSummary {
  return {
    id: session.id,
    handNumber: session.snapshot.currentHandNumber,
    handsPlayed: session.snapshot.handHistory.length,
    bankroll: session.snapshot.humanBankroll,
    savedAt: session.savedAt,
    trial: session.config.trial === true,
  }
}

/**
 * Whether a saved table has been left for longer than a day.
 *
 * A clock that runs backwards (a `savedAt` in the future) is not "abandoned".
 */
export function isAbandoned(session: Pick<SavedLiveSession, 'savedAt'>, now: number = Date.now()): boolean {
  return now - session.savedAt > ABANDONED_AFTER_MS
}
