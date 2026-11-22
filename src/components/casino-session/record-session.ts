import { useStatsStore } from '../../store/stats-store'
import { useCasinoSessionTrackerStore } from '../../store/casino-session-tracker-store'
import { useLiveSessionStore } from '../../store/live-session-store'
import { useLevelStore } from '../../store/level-store'
import { CasinoSessionEngine } from '../../engine/casino-session/session-engine'
import type { CasinoSessionResult } from '../../engine/casino-session/types'
import type { CasinoSessionDetails } from '../../services/stats-types'
import {
  claimRecording,
  clearLiveSession,
  isAbandoned,
  loadLiveSession,
  loadSalvageableSession,
} from '../../services/casino-live-session'
import { registerBeforeSignOut } from '../../services/storage/before-sign-out'
import { isRecordableSession } from './helpers'

/**
 * Writing a casino session down — the one way, for every way a session ends.
 *
 * A session used to be recorded in exactly one place: the callback behind the
 * table's "Cash out". Now a table also survives a closed tab, so there are
 * three more ways to end one — "Cash out now" on the resume card, the
 * automatic cash-out of a table left for a day, and a second tab doing either
 * while the first still sits at the table. All of them come through
 * `recordCasinoSession`, so the statistics row, the XP and the tracker entry
 * are the same whichever door was used — and are written once.
 */

export interface RecordOptions {
  /**
   * The id the table was given when it started, or null for a session that
   * has none (only tests start one that way). With an id the recording is
   * idempotent — see `claimRecording`.
   */
  liveId: string | null
  /**
   * When the session ended, if that is not now: the time of the last saved
   * hand, for a table that is cashed out after the fact.
   */
  endedAt?: number
}

/**
 * Record a finished casino session: statistics (and with them XP, challenges
 * and achievements) and the Casino Session Tracker.
 *
 * @returns Whether the session was recorded. False for a session with no
 *   hands — that is not a session — and for one that has been recorded before.
 */
export function recordCasinoSession(sessionResult: CasinoSessionResult, { liveId, endedAt }: RecordOptions): boolean {
  const recorded = record(sessionResult, liveId, endedAt)
  // Whatever happened, the saved table is settled one way or the other: the
  // resume card must stop offering it.
  useLiveSessionStore.getState().refreshSaved()
  return recorded
}

/**
 * The device write of the session recorded last. Nobody waits for it on the
 * ordinary paths; the sign-out does, because the wipe comes straight after.
 */
let lastWrite: Promise<void> = Promise.resolve()

function record(sessionResult: CasinoSessionResult, liveId: string | null, endedAt: number | undefined): boolean {
  const hands = sessionResult.hands

  /*
    A session with no hands in it is not a session.

    Everything below ran unconditionally once, so opening the table and leaving
    again wrote a full row: 60 XP for the casino base reward, a zero-hand
    entry in the analytics and in the bankroll tracker, and — because the
    final curriculum stage asks for three casino sessions at `minAccuracy: 0`
    — one third of the last stage of the training plan. Three open-and-close
    round trips finished it without a card being dealt.

    The rule itself lives in `helpers.ts`. The saved table goes all the same:
    there is nothing in it to come back for.
  */
  if (!isRecordableSession(hands.length)) {
    if (liveId) clearLiveSession(liveId)
    return false
  }

  // Once, whoever asks: the cash-out, the automatic one, a second tab. The
  // saved table is removed with the claim, before anything is written.
  if (liveId && !claimRecording(liveId)) return false

  const hadBlackjack = hands.some(h => h.result === 'blackjack')
  // After a split the record holds hand 1 only ([A, x]), so "both cards are
  // aces" was almost never true and the achievement rarely fired. A first
  // action of Split on a hand that starts with an ace *is* a pair of aces.
  const splitAces = hands.some(h =>
    h.playerCards.length >= 1 &&
    h.playerCards[0].rank === 'A' &&
    h.firstAction === 'Split'
  )
  let longestWinStreak = 0
  let currentStreak = 0
  for (const h of hands) {
    if (h.result === 'win' || h.result === 'blackjack') {
      currentStreak++
      if (currentStreak > longestWinStreak) longestWinStreak = currentStreak
    } else {
      currentStreak = 0
    }
  }
  let maxSplitHands = 1
  for (const h of hands) {
    const splitCount = h.decisions.filter(d => d.action === 'Split').length
    if (splitCount + 1 > maxSplitHands) maxSplitHands = splitCount + 1
  }

  // Save to stats store for analytics
  const details: CasinoSessionDetails = {
    type: 'casinoSession',
    handsPlayed: hands.length,
    netProfit: sessionResult.netProfit,
    overallScore: sessionResult.overallScore,
    grade: sessionResult.grade,
    betAccuracy: sessionResult.betAccuracy,
    playAccuracy: sessionResult.playAccuracy,
    countAccuracy: sessionResult.countAccuracy,
    totalCountChecks: sessionResult.totalCountChecks,
    deviationAccuracy: sessionResult.deviationAccuracy,
    totalDeviationSituations: sessionResult.totalDeviationSituations,
    playStyle: sessionResult.config.playStyle ?? 'counting',
    // Only where it is true: the paywall reads it to say what the trial came to.
    ...(sessionResult.config.trial ? { trial: true } : {}),
    numBots: sessionResult.config.numBots,
    hadBlackjack,
    longestWinStreak,
    splitAces,
    maxSplitHands,
    // Carried so the Casino Session Tracker can be rebuilt after a sign-out
    // wipes it. `details` is jsonb, so this costs no migration.
    startingBankroll: sessionResult.startingBankroll,
    finalBankroll: sessionResult.finalBankroll,
    tableConfig: {
      numDecks: sessionResult.config.numDecks,
      minBet: sessionResult.config.minBet,
      blackjackPays: sessionResult.config.blackjackPays,
    },
  }
  // XP follows the same rule as the grade: in basic play the bets are not a
  // decision the player was asked to get right, so they do not count against
  // the accuracy that sets the XP tier.
  const basicPlay = sessionResult.config.playStyle === 'basic'
  const totalDecisions = sessionResult.totalPlayDecisions + (basicPlay ? 0 : sessionResult.totalBetDecisions)
  const correctDecisions = sessionResult.correctPlayDecisions + (basicPlay ? 0 : sessionResult.correctBetDecisions)
  // Fire-and-forget by design: the session, the XP and the achievements are
  // all applied synchronously inside, and persistence is best-effort and
  // cannot reject. See the tail of `recordSession`.
  lastWrite = useStatsStore.getState().recordSession({
    mode: 'casinoSession',
    startTime: sessionResult.startTime,
    totalQuestions: totalDecisions,
    correctAnswers: correctDecisions,
    bestStreak: 0,
    details,
    countingSystem: sessionResult.config.countingSystem,
    // The table's own id: a second row for the same table is refused by the
    // store and upserted, not added, by the cloud.
    ...(liveId ? { id: liveId } : {}),
    ...(endedAt !== undefined ? { endTime: endedAt } : {}),
  })

  // Every cashed-out session lands in the Casino Session Tracker. It used to
  // land there only if the tracker had been set up by hand first, so a
  // player who never opened it lost every session. A tracker nobody set up
  // starts from this session's own bankroll.
  const trackerStore = useCasinoSessionTrackerStore.getState()
  if (trackerStore.startingBankroll === 0 && trackerStore.sessions.length === 0) {
    trackerStore.setStartingBankroll(sessionResult.startingBankroll)
  }
  const ended = endedAt ?? Date.now()
  const day = new Date(ended)
  const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
  // The same id as the statistics row, which is also the id the tracker is
  // rebuilt under after a sign-out — so the two can never show one table twice.
  const trackerId = liveId ?? `cs-${ended}`
  if (!trackerStore.sessions.some(s => s.id === trackerId)) {
    trackerStore.addSession({
      id: trackerId,
      date: dateStr,
      timestamp: ended,
      handsPlayed: hands.length,
      duration: sessionResult.durationSeconds,
      startingBankroll: sessionResult.startingBankroll,
      finalBankroll: sessionResult.finalBankroll,
      profit: sessionResult.netProfit,
      betAccuracy: sessionResult.betAccuracy,
      playAccuracy: sessionResult.playAccuracy,
      countAccuracy: sessionResult.countAccuracy,
      overallScore: sessionResult.overallScore,
      grade: sessionResult.grade,
      numBots: sessionResult.config.numBots,
      config: {
        numDecks: sessionResult.config.numDecks,
        minBet: sessionResult.config.minBet,
        blackjackPays: sessionResult.config.blackjackPays,
      },
    })
  }
  return true
}

/** What became of a saved table. */
export type SettleOutcome =
  /** Written to the statistics and the tracker. */
  | 'recorded'
  /** It held no finished hand (or could not be read): removed, nothing written. */
  | 'discarded'
  /** There was no saved table, or somebody else settled it first. */
  | 'none'

/**
 * Cash out the table saved on this device without sitting down at it again:
 * the resume card's "Cash out now", and the automatic cash-out.
 *
 * It is the same recording as the table's own Cash out — same row, same XP,
 * same tracker entry — with two differences that follow from nobody being at
 * the table. The session ended when its last hand was saved, not now, so that
 * is its timestamp and its duration stops there. And there is no summary
 * screen: the caller stays where it is.
 *
 * The statistics are loaded first. `recordSession` puts the new session at
 * the head of the list it has in memory, and on a page that has just loaded
 * that list is empty: the session would have become the whole history on
 * screen, and the day's XP limit would have been worked out against nothing.
 *
 * @param only - Settle the table with this id and no other; omitted, whichever is saved
 */
export async function settleSavedSession(only?: string): Promise<SettleOutcome> {
  if (!loadLiveSession()) {
    useLiveSessionStore.getState().refreshSaved()
    return 'none'
  }
  await useStatsStore.getState().loadStats()

  // Read again after the wait: a second click or another tab may have settled
  // it meanwhile. From here to the end nothing is awaited, so the claim and
  // the recording happen in one go.
  const saved = loadLiveSession()
  if (!saved || (only !== undefined && saved.id !== only)) {
    useLiveSessionStore.getState().refreshSaved()
    return 'none'
  }
  const engine = CasinoSessionEngine.restore(saved.snapshot)
  if (!engine) {
    clearLiveSession(saved.id)
    useLiveSessionStore.getState().refreshSaved()
    return 'discarded'
  }
  const endedAt = saved.savedAt
  const result = engine.calculateSessionResult(endedAt - saved.elapsedSeconds * 1000, endedAt)
  if (!isRecordableSession(result.hands.length)) {
    recordCasinoSession(result, { liveId: saved.id, endedAt })
    return 'discarded'
  }
  return recordCasinoSession(result, { liveId: saved.id, endedAt }) ? 'recorded' : 'none'
}

/**
 * On app load: look at the saved table, and cash it out if it was abandoned.
 *
 * A table nobody came back to within a day is not going to be continued, and
 * the hands played at it were played. It is recorded — silently, with the time
 * of its last hand — so that nobody loses them to a phone that died. A table
 * with no finished hand is dropped instead. Anything younger is left for the
 * resume card to offer.
 *
 * Safe to call more than once and from more than one tab: the recording is
 * claimed by the table's id.
 *
 * @param now - The current time, for tests
 */
export async function settleAbandonedSession(now: number = Date.now()): Promise<SettleOutcome> {
  // First what this build cannot continue at all: there is nothing to wait a
  // day for, and the next table started would write over it.
  await salvageUnreadableSession()
  const saved = loadLiveSession()
  if (!saved || !isAbandoned(saved, now)) {
    useLiveSessionStore.getState().refreshSaved()
    return 'none'
  }
  // Not published first: the card would offer for a moment a table that is
  // about to be cashed out.
  const outcome = await settleSavedSession(saved.id)
  // Nobody pressed anything, so nothing announces itself: the XP is in the
  // total, the toast for it is not shown. (A level reached this way still
  // shows — that is news whenever it arrives.)
  if (outcome === 'recorded') useLevelStore.getState().dismissXpAward()
  return outcome
}

/**
 * Write down a saved table this build cannot put back on the felt.
 *
 * A deploy that changes the saved shape meets tables written by the build
 * before it. They used to be deleted on sight, hands included. Now the record
 * stays, and whatever of it still reads — the finished hands, the bankroll
 * with its peak and drawdown, the clock — is recorded as the session it was,
 * dated by its last save, under the table's own id (so it is recorded once).
 *
 * Nothing is made up. The result is computed by the engine from the hands and
 * the figures in the record; the shoe and the seats it is given are a fresh
 * table's and enter no figure of a session result. A record that lacks one of
 * those figures, belongs to someone else or comes from a newer build is left
 * alone.
 */
export async function salvageUnreadableSession(): Promise<SettleOutcome> {
  if (!loadSalvageableSession()) return 'none'
  await useStatsStore.getState().loadStats()
  // Read again after the wait, as in `settleSavedSession`.
  const found = loadSalvageableSession()
  if (!found) return 'none'
  let engine: CasinoSessionEngine | null = null
  try {
    engine = CasinoSessionEngine.restore({
      ...new CasinoSessionEngine(found.config).snapshot(),
      handHistory: found.handHistory,
      currentHandNumber: found.handHistory.length,
      humanBankroll: found.humanBankroll,
      peakBankroll: found.peakBankroll,
      worstDrawdown: found.worstDrawdown,
    })
  } catch { /* a config this build cannot seat a table for: left alone */ }
  if (!engine) return 'none'
  const result = engine.calculateSessionResult(found.savedAt - found.elapsedSeconds * 1000, found.savedAt)
  const recorded = recordCasinoSession(result, { liveId: found.id, endedAt: found.savedAt })
  if (!isRecordableSession(result.hands.length)) return 'discarded'
  if (recorded) useLevelStore.getState().dismissXpAward()
  return recorded ? 'recorded' : 'none'
}

/** The tables being played in this tab, each as the function that ends it without a summary. */
const openTables = new Set<() => void>()

/**
 * A table on the felt announces itself, so a sign-out can end it first.
 *
 * @param end - Ends the table exactly like a cash-out, without a summary
 *   screen: records it and makes its unmount do nothing
 * @returns The function that takes the announcement back (on unmount)
 */
export function registerOpenTable(end: () => void): () => void {
  openTables.add(end)
  return () => { openTables.delete(end) }
}

/**
 * Before a sign-out wipes the device: everything a casino table still holds
 * is written down, while the statistics still have an owner.
 *
 * The wipe resets the entitlement, the table unmounts, and its unmount used to
 * record the session *after* the wipe — into storage that belonged to nobody
 * and was then merged into the next account to sign in on this browser. And a
 * table that was only saved (another tab, an earlier visit) was wiped with its
 * hands unrecorded.
 *
 * In order: the table open in this tab, the saved one, then one this build
 * cannot read. The last line waits for the device write of whatever was
 * recorded; the upload itself is the sync layer's.
 */
export async function settleBeforeSignOut(): Promise<void> {
  for (const end of [...openTables]) end()
  await settleSavedSession()
  await salvageUnreadableSession()
  await lastWrite
}

registerBeforeSignOut(settleBeforeSignOut)
