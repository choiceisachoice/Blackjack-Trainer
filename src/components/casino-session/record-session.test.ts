import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CasinoSessionEngine } from '../../engine/casino-session/session-engine'
import { useStatsStore } from '../../store/stats-store'
import { useLevelStore } from '../../store/level-store'
import { useLiveSessionStore } from '../../store/live-session-store'
import { useCasinoSessionTrackerStore } from '../../store/casino-session-tracker-store'
import { levelSystem } from '../../services/level-system'
import {
  ABANDONED_AFTER_MS,
  LIVE_SESSION_KEY,
  loadLiveSession,
  saveLiveSession,
} from '../../services/casino-live-session'
import {
  recordCasinoSession, registerOpenTable, salvageUnreadableSession,
  settleAbandonedSession, settleSavedSession,
} from './record-session'
import { runBeforeSignOut } from '../../services/storage/before-sign-out'
import { savedTable } from './saved-table.fixture'

/**
 * Writing a casino session down, once.
 *
 * A table can now be ended from four places — its own Cash out, the resume
 * card, the automatic cash-out of an abandoned table, and any of those in a
 * second tab. These tests hold all of them to one row in the statistics, one
 * XP payout and one tracker entry.
 */

const casinoSessions = () => useStatsStore.getState().sessions.filter(s => s.mode === 'casinoSession')
const tracked = () => useCasinoSessionTrackerStore.getState().sessions

/** The result a table at `saved` would cash out with. */
function resultOf(saved: ReturnType<typeof savedTable>) {
  return CasinoSessionEngine.restore(saved.snapshot)!.calculateSessionResult(saved.savedAt - 600_000, saved.savedAt)
}

beforeEach(() => {
  localStorage.clear()
  levelSystem.resetAll()
  useLevelStore.getState().refresh()
  useLevelStore.getState().dismissXpAward()
  useStatsStore.setState({ sessions: [], lifetimeStats: null, isLoading: false })
  useCasinoSessionTrackerStore.setState({ sessions: [], startingBankroll: 0 })
  useLiveSessionStore.setState({ activeMode: null, pending: null, saved: null, resumeRequested: false })
})
afterEach(() => { vi.restoreAllMocks() })

describe('recording a session', () => {
  it('writes the statistics row, pays XP and adds the tracker entry', () => {
    const saved = savedTable([25, -25, 25])
    saveLiveSession(saved)
    expect(recordCasinoSession(resultOf(saved), { liveId: saved.id })).toBe(true)

    const [row] = casinoSessions()
    expect(row.id).toBe(saved.id)
    expect(row.details).toMatchObject({ type: 'casinoSession', handsPlayed: 3, netProfit: 25, startingBankroll: 5000, finalBankroll: 5025 })
    expect(useLevelStore.getState().totalXP).toBeGreaterThan(0)
    expect(tracked()).toHaveLength(1)
    expect(tracked()[0]).toMatchObject({ id: saved.id, handsPlayed: 3, profit: 25, finalBankroll: 5025 })
    expect(useCasinoSessionTrackerStore.getState().startingBankroll).toBe(5000)
  })

  it('marks a session of the free trial table, and no other', () => {
    const saved = savedTable([25, -25])
    recordCasinoSession(resultOf(saved), { liveId: saved.id })
    expect(casinoSessions().find(s => s.id === saved.id)?.details).not.toHaveProperty('trial')

    const trial = savedTable([25], { id: 'the-trial-table' })
    const result = resultOf(trial)
    recordCasinoSession({ ...result, config: { ...result.config, trial: true } }, { liveId: trial.id })
    // Recorded like any other: a row, XP, a tracker entry — plus the mark.
    expect(casinoSessions().find(s => s.id === trial.id)?.details).toMatchObject({ handsPlayed: 1, trial: true })
    expect(tracked()).toHaveLength(2)
  })

  it('takes the saved table away, so it is not offered again', () => {
    const saved = savedTable()
    saveLiveSession(saved)
    useLiveSessionStore.getState().refreshSaved()
    expect(useLiveSessionStore.getState().saved).not.toBeNull()

    recordCasinoSession(resultOf(saved), { liveId: saved.id })
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
    expect(useLiveSessionStore.getState().saved).toBeNull()
  })

  it('records the same session once, however often it is asked — two tabs, two clicks', () => {
    const saved = savedTable()
    saveLiveSession(saved)
    const result = resultOf(saved)

    expect(recordCasinoSession(result, { liveId: saved.id })).toBe(true)
    const xp = useLevelStore.getState().totalXP
    expect(recordCasinoSession(result, { liveId: saved.id })).toBe(false)
    expect(recordCasinoSession(result, { liveId: saved.id })).toBe(false)

    expect(casinoSessions()).toHaveLength(1)
    expect(tracked()).toHaveLength(1)
    expect(useLevelStore.getState().totalXP).toBe(xp)
  })

  it('records once even when the second tab has forgotten the claim — the row itself is keyed on the table', () => {
    const saved = savedTable()
    const result = resultOf(saved)
    recordCasinoSession(result, { liveId: saved.id })
    const xp = useLevelStore.getState().totalXP
    // The other tab read the list of recorded ids a moment too early.
    localStorage.removeItem('bjt_casino_recorded')
    recordCasinoSession(result, { liveId: saved.id })

    expect(casinoSessions()).toHaveLength(1)
    expect(tracked()).toHaveLength(1)
    expect(useLevelStore.getState().totalXP).toBe(xp)
  })

  it('does not record a session with no hands, and puts its saved table away', () => {
    const saved = savedTable([])
    saveLiveSession(saved)
    expect(recordCasinoSession(resultOf(saved), { liveId: saved.id })).toBe(false)

    expect(casinoSessions()).toHaveLength(0)
    expect(tracked()).toHaveLength(0)
    expect(useLevelStore.getState().totalXP).toBe(0)
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
  })

  it('still records a session that was never given an id', () => {
    expect(recordCasinoSession(resultOf(savedTable()), { liveId: null })).toBe(true)
    expect(casinoSessions()).toHaveLength(1)
    expect(tracked()).toHaveLength(1)
  })

  it('leaves another, newer saved table where it is', () => {
    const older = savedTable([25], { id: 'aaaaaaaa-0000-4000-8000-000000000001' })
    const newer = savedTable([25, 25], { id: 'aaaaaaaa-0000-4000-8000-000000000002' })
    saveLiveSession(newer)
    recordCasinoSession(resultOf(older), { liveId: older.id })
    expect(loadLiveSession()!.id).toBe(newer.id)
  })
})

describe('"Cash out now": settling the saved table without sitting down', () => {
  it('records it exactly as the table\'s own cash-out would', async () => {
    const saved = savedTable([25, -25, 25])
    saveLiveSession(saved)
    expect(await settleSavedSession()).toBe('recorded')

    // The same recording, made directly from the same table.
    const viaCard = { row: casinoSessions()[0], entry: tracked()[0], xp: useLevelStore.getState().totalXP }
    localStorage.clear()
    levelSystem.resetAll()
    useLevelStore.getState().refresh()
    useStatsStore.setState({ sessions: [], lifetimeStats: null })
    useCasinoSessionTrackerStore.setState({ sessions: [], startingBankroll: 0 })
    recordCasinoSession(resultOf(saved), { liveId: saved.id, endedAt: saved.savedAt })

    expect(viaCard.row).toEqual(casinoSessions()[0])
    expect(viaCard.entry).toEqual(tracked()[0])
    expect(viaCard.xp).toBe(useLevelStore.getState().totalXP)
  })

  it('dates the session by its last saved hand, not by the click', async () => {
    const savedAt = Date.now() - 5 * 60 * 60 * 1000
    saveLiveSession(savedTable([25, 25], { savedAt, elapsedSeconds: 900 }))
    await settleSavedSession()

    const [row] = casinoSessions()
    expect(row.durationSeconds).toBe(900)
    expect(new Date(row.timestamp).getTime()).toBe(savedAt - 900_000)
    expect(tracked()[0].timestamp).toBe(savedAt)
    expect(tracked()[0].duration).toBe(900)
  })

  it('loads the history first, so the new session joins it instead of replacing it', async () => {
    // An hour before the table was started: the list is kept newest first by
    // start time now, so "earlier" has to be earlier.
    const earlier = { ...casinoRowStub(), id: 'earlier', timestamp: new Date(Date.now() - 3_600_000).toISOString() }
    localStorage.setItem('bjt_sessions', JSON.stringify([earlier]))
    const saved = savedTable()
    saveLiveSession(saved)
    await settleSavedSession()
    expect(useStatsStore.getState().sessions.map(x => x.id)).toEqual([saved.id, 'earlier'])
  })

  it('records once when it is asked twice at the same moment', async () => {
    saveLiveSession(savedTable())
    const outcomes = await Promise.all([settleSavedSession(), settleSavedSession()])
    expect(outcomes.sort()).toEqual(['none', 'recorded'])
    expect(casinoSessions()).toHaveLength(1)
    expect(tracked()).toHaveLength(1)
  })

  it('discards a table with no hands instead of recording it', async () => {
    saveLiveSession(savedTable([]))
    expect(await settleSavedSession()).toBe('discarded')
    expect(casinoSessions()).toHaveLength(0)
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
  })

  it('does nothing when there is no saved table', async () => {
    expect(await settleSavedSession()).toBe('none')
    expect(casinoSessions()).toHaveLength(0)
  })

  it('does nothing when the saved table is not the one it was asked about', async () => {
    saveLiveSession(savedTable())
    expect(await settleSavedSession('some-other-table')).toBe('none')
    expect(loadLiveSession()).not.toBeNull()
    expect(casinoSessions()).toHaveLength(0)
  })
})

describe('a table left for more than a day', () => {
  const longAgo = () => Date.now() - ABANDONED_AFTER_MS - 60_000

  it('is cashed out when the app loads, dated by its last hand', async () => {
    const savedAt = longAgo()
    saveLiveSession(savedTable([25, 25, -25, 25], { savedAt, elapsedSeconds: 1200 }))
    expect(await settleAbandonedSession()).toBe('recorded')

    const [row] = casinoSessions()
    expect(row.details).toMatchObject({ handsPlayed: 4, netProfit: 50 })
    expect(row.durationSeconds).toBe(1200)
    expect(new Date(row.timestamp).getTime()).toBe(savedAt - 1_200_000)
    expect(tracked()[0].timestamp).toBe(savedAt)
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
    expect(useLiveSessionStore.getState().saved).toBeNull()
  })

  it('is cashed out once, however often the app looks', async () => {
    saveLiveSession(savedTable([25], { savedAt: longAgo() }))
    const outcomes = await Promise.all([settleAbandonedSession(), settleAbandonedSession()])
    await settleAbandonedSession()
    expect(outcomes.filter(o => o === 'recorded')).toHaveLength(1)
    expect(casinoSessions()).toHaveLength(1)
    expect(tracked()).toHaveLength(1)
  })

  it('pays its XP without announcing it', async () => {
    saveLiveSession(savedTable([25], { savedAt: longAgo() }))
    await settleAbandonedSession()
    expect(useLevelStore.getState().totalXP).toBeGreaterThan(0)
    expect(useLevelStore.getState().lastAward).toBeNull()
  })

  it('is thrown away, not recorded, when no hand was finished at it', async () => {
    saveLiveSession(savedTable([], { savedAt: longAgo() }))
    expect(await settleAbandonedSession()).toBe('discarded')
    expect(casinoSessions()).toHaveLength(0)
    expect(tracked()).toHaveLength(0)
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
    expect(useLiveSessionStore.getState().saved).toBeNull()
  })

  it('is never offered on the card first', async () => {
    saveLiveSession(savedTable([25], { savedAt: longAgo() }))
    const seen: unknown[] = []
    const stop = useLiveSessionStore.subscribe(s => { seen.push(s.saved) })
    await settleAbandonedSession()
    stop()
    expect(seen.every(s => s === null)).toBe(true)
  })
})

describe('a table left for less than a day', () => {
  it('is kept, and published for the resume card', async () => {
    const saved = savedTable([25, -25, 25], { savedAt: Date.now() - 23 * 60 * 60 * 1000 })
    saveLiveSession(saved)
    expect(await settleAbandonedSession()).toBe('none')

    expect(casinoSessions()).toHaveLength(0)
    expect(loadLiveSession()).not.toBeNull()
    expect(useLiveSessionStore.getState().saved).toMatchObject({ id: saved.id, handNumber: 3, handsPlayed: 3, bankroll: 5025 })
  })

  it('takes the day from the clock it is given', async () => {
    const saved = savedTable([25])
    saveLiveSession(saved)
    expect(await settleAbandonedSession(saved.savedAt + ABANDONED_AFTER_MS + 1)).toBe('recorded')
  })
})

/** Any stored session row; only its presence matters to the test that uses it. */
function casinoRowStub() {
  return {
    mode: 'speedDrill', timestamp: new Date().toISOString(), countingSystem: 'HiLo', durationSeconds: 60,
    totalQuestions: 10, correctAnswers: 8, accuracy: 0.8, bestStreak: 3,
    details: { type: 'speedDrill', cardsPerRound: 20, speedMs: 1000, rcErrors: [] },
  }
}

/**
 * A sign-out wipes the device. Whatever a table still holds is written down
 * first — this module registers that work itself, when it is loaded.
 */
describe('before a sign-out wipes the device', () => {
  it('cashes out a table that is saved and not open, instead of letting it be wiped', async () => {
    const saved = savedTable([25, -25, 25])
    saveLiveSession(saved)
    await runBeforeSignOut()

    expect(casinoSessions()).toHaveLength(1)
    expect(casinoSessions()[0].id).toBe(saved.id)
    expect(casinoSessions()[0].details).toMatchObject({ handsPlayed: 3, netProfit: 25 })
    expect(tracked()).toHaveLength(1)
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
    // Written to the device by the time the sign-out goes on to wipe it.
    expect(localStorage.getItem('bjt_sessions')).toContain(saved.id)
  })

  it('ends a table that is open in this tab first, and records it once', async () => {
    const saved = savedTable([25, 25])
    saveLiveSession(saved)
    const end = vi.fn(() => { recordCasinoSession(resultOf(saved), { liveId: saved.id }) })
    const unregister = registerOpenTable(end)
    await runBeforeSignOut()
    unregister()

    expect(end).toHaveBeenCalledOnce()
    expect(casinoSessions()).toHaveLength(1)
    // Recorded by the table itself — now, not dated back to its last save.
    expect(tracked()[0].timestamp).toBeGreaterThan(saved.savedAt)
  })

  it('no longer calls a table that has left', async () => {
    const end = vi.fn()
    registerOpenTable(end)()
    await runBeforeSignOut()
    expect(end).not.toHaveBeenCalled()
  })

  it('does nothing, and does not fail, when there is no table', async () => {
    await expect(runBeforeSignOut()).resolves.toBeUndefined()
    expect(casinoSessions()).toHaveLength(0)
  })
})

/**
 * A deploy that changes the saved shape meets tables of the build before it.
 */
describe('a saved table this build cannot continue', () => {
  /** The saved record with its shoe cut short: no longer a table, still a session. */
  function saveUnreadable(change: (r: Record<string, unknown>) => void = () => {}) {
    const saved = savedTable([25, -25, 25], { savedAt: Date.now() - 3_600_000, elapsedSeconds: 900 })
    saveLiveSession(saved)
    const record = JSON.parse(localStorage.getItem(LIVE_SESSION_KEY)!) as Record<string, unknown>
    ;((record.snapshot as Record<string, unknown>).shoe as { cards: number[] }).cards.length = 10
    change(record)
    localStorage.setItem(LIVE_SESSION_KEY, JSON.stringify(record))
    return saved
  }

  it('is recorded from its hands and its own bankroll figures', async () => {
    const saved = saveUnreadable()
    expect(loadLiveSession()).toBeNull()
    expect(await salvageUnreadableSession()).toBe('recorded')

    const [row] = casinoSessions()
    // Exactly what cashing the same table out would have written.
    const intact = resultOf(saved)
    expect(row.id).toBe(saved.id)
    expect(row.details).toMatchObject({
      handsPlayed: 3, netProfit: intact.netProfit, finalBankroll: intact.finalBankroll,
      startingBankroll: intact.startingBankroll, overallScore: intact.overallScore,
    })
    expect(row.durationSeconds).toBe(900)
    expect(tracked()[0]).toMatchObject({ id: saved.id, timestamp: saved.savedAt, profit: intact.netProfit })
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
  })

  it('is recorded once', async () => {
    saveUnreadable()
    await Promise.all([salvageUnreadableSession(), salvageUnreadableSession()])
    expect(await salvageUnreadableSession()).toBe('none')
    expect(casinoSessions()).toHaveLength(1)
  })

  it('is recorded when the app loads, however young it is', async () => {
    saveUnreadable()
    await settleAbandonedSession()
    expect(casinoSessions()).toHaveLength(1)
  })

  it('is left exactly where it is when a figure is missing — nothing is invented', async () => {
    saveUnreadable(r => { delete (r.snapshot as Record<string, unknown>).peakBankroll })
    const stored = localStorage.getItem(LIVE_SESSION_KEY)
    expect(await salvageUnreadableSession()).toBe('none')
    await settleAbandonedSession()
    expect(casinoSessions()).toHaveLength(0)
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBe(stored)
  })

  it('is left alone when a newer build wrote it', async () => {
    saveUnreadable(r => { r.version = 99 })
    const stored = localStorage.getItem(LIVE_SESSION_KEY)
    expect(await salvageUnreadableSession()).toBe('none')
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBe(stored)
  })

  it('leaves a table that loads normally to the resume card', async () => {
    saveLiveSession(savedTable([25]))
    expect(await salvageUnreadableSession()).toBe('none')
    expect(loadLiveSession()).not.toBeNull()
  })
})
