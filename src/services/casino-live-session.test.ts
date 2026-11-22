import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CasinoSessionEngine } from '../engine/casino-session/session-engine'
import { CountingSystemId } from '../engine/counting/types'
import type { CasinoSessionConfig } from '../engine/casino-session/types'
import {
  ABANDONED_AFTER_MS,
  LIVE_SESSION_KEY,
  LIVE_SESSION_VERSION,
  RECORDED_IDS_KEY,
  claimRecording,
  clearLiveSession,
  isAbandoned,
  isRecorded,
  loadLiveSession,
  loadSalvageableSession,
  newLiveSessionId,
  saveLiveSession,
  summarize,
  type SavedLiveSession,
} from './casino-live-session'
import { LOCAL_OWNER_KEY } from './storage/local-owner'

/**
 * The table kept on the device.
 *
 * What these pin: a saved table comes back whole or not at all; a write that
 * fails costs nothing; and a session can be claimed for recording exactly
 * once, by whoever asks first.
 */

const CONFIG: CasinoSessionConfig = {
  sessionMode: 'unlimited',
  targetHands: 20,
  targetMinutes: 15,
  numBots: 2,
  playerSeatIndex: 3,
  multiHand: false,
  startingBankroll: 5000,
  minBet: 25,
  maxBet: 500,
  numDecks: 6,
  dealerHitsSoft17: false,
  doubleAfterSplit: true,
  surrenderAllowed: true,
  blackjackPays: 1.5,
  penetration: 0.75,
  maxSplitHands: 4,
  playStyle: 'counting',
  trainingMode: true,
  countCheckFrequency: 'never',
  showDeviationHints: true,
  countingSystem: CountingSystemId.HiLo,
  casinoAmbience: false,
}

function table(id = 'table-1', savedAt = 1_000_000): Omit<SavedLiveSession, 'version' | 'owner'> {
  const engine = new CasinoSessionEngine(CONFIG)
  engine.updateHumanBankroll(120)
  return {
    id,
    snapshot: engine.snapshot(),
    config: CONFIG,
    elapsedSeconds: 754,
    savedAt,
    ui: { lastBets: [50], keptPlaying: true },
  }
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { vi.restoreAllMocks() })

describe('saving and loading', () => {
  it('gives back the table that was saved', () => {
    const saved = table()
    expect(saveLiveSession(saved)).toBe(true)
    const loaded = loadLiveSession()
    expect(loaded).toEqual({ ...saved, owner: null, version: LIVE_SESSION_VERSION })
    expect(CasinoSessionEngine.restore(loaded!.snapshot)!.getHumanBankroll()).toBe(5120)
  })

  it('lives under a bjt_ key, so signing out takes it', () => {
    saveLiveSession(table())
    expect(LIVE_SESSION_KEY).toBe('bjt_casino_live')
    expect(localStorage.getItem('bjt_casino_live')).not.toBeNull()
    expect(RECORDED_IDS_KEY.startsWith('bjt_')).toBe(true)
  })

  it('has nothing to load when nothing was saved', () => {
    expect(loadLiveSession()).toBeNull()
  })

  it('keeps one table: the newer one replaces the older', () => {
    saveLiveSession(table('first'))
    saveLiveSession(table('second'))
    expect(loadLiveSession()!.id).toBe('second')
  })

  it('says what the resume card needs', () => {
    saveLiveSession(table('t', 42))
    expect(summarize(loadLiveSession()!)).toEqual({ id: 't', handNumber: 0, handsPlayed: 0, bankroll: 5120, savedAt: 42, trial: false })
  })

  it('says when the saved table is the free trial\'s', () => {
    const saved = table('t', 42)
    const config = { ...saved.config, trial: true }
    saveLiveSession({ ...saved, config, snapshot: { ...saved.snapshot, config } })
    expect(summarize(loadLiveSession()!).trial).toBe(true)
  })

  it('makes ids that are uuids, as the statistics table wants', () => {
    expect(newLiveSessionId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(newLiveSessionId()).not.toBe(newLiveSessionId())
  })
})

describe('a write that fails', () => {
  it('is swallowed: a full quota never reaches the table', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
    expect(() => saveLiveSession(table())).not.toThrow()
    expect(saveLiveSession(table())).toBe(false)
  })

  it('leaves the copy that was there before', () => {
    saveLiveSession(table('kept'))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
    saveLiveSession(table('lost'))
    vi.restoreAllMocks()
    expect(loadLiveSession()!.id).toBe('kept')
  })

  it('is survived when there is no storage at all', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied') })
    expect(saveLiveSession(table())).toBe(false)
    expect(loadLiveSession()).toBeNull()
    expect(() => clearLiveSession()).not.toThrow()
    expect(() => clearLiveSession('x')).not.toThrow()
    // Nothing to keep the list in — and no saved table to record twice.
    expect(claimRecording('x')).toBe(true)
  })
})

describe('a record that cannot be trusted', () => {
  const stored = () => JSON.parse(localStorage.getItem(LIVE_SESSION_KEY)!) as Record<string, unknown>
  const corrupt = (change: (r: Record<string, unknown>) => void) => {
    saveLiveSession(table())
    const record = stored()
    change(record)
    localStorage.setItem(LIVE_SESSION_KEY, JSON.stringify(record))
  }

  const cases: [string, (r: Record<string, unknown>) => void][] = [
    ['another version of the record', r => { r.version = LIVE_SESSION_VERSION + 1 }],
    ['another version of the table', r => { (r.snapshot as Record<string, unknown>).version = 99 }],
    ['no id', r => { delete r.id }],
    ['no table', r => { delete r.snapshot }],
    ['a clock that is not a number', r => { r.elapsedSeconds = 'long' }],
    ['no time of saving', r => { delete r.savedAt }],
    ['a broken shoe', r => { ((r.snapshot as Record<string, unknown>).shoe as { cards: number[] }).cards.length = 10 }],
  ]
  for (const [name, change] of cases) {
    // Turned around: this used to assert the record was REMOVED. A build that
    // deletes what it cannot read costs a player mid-table their hands on
    // every deploy that changes the shape.
    it(`is not loaded, and is left where it is: ${name}`, () => {
      corrupt(change)
      const before = localStorage.getItem(LIVE_SESSION_KEY)
      expect(loadLiveSession()).toBeNull()
      expect(localStorage.getItem(LIVE_SESSION_KEY)).toBe(before)
    })
  }

  it('is not loaded when it is not JSON — and is left, too', () => {
    const cut = '{"version":1,"id":"x","snap'
    localStorage.setItem(LIVE_SESSION_KEY, cut)
    expect(() => loadLiveSession()).not.toThrow()
    expect(loadLiveSession()).toBeNull()
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBe(cut)
  })

  it('is not loaded without an owner field: that is a record of another shape', () => {
    corrupt(r => { delete r.owner })
    expect(loadLiveSession()).toBeNull()
  })

  it('takes the rules from the table, not from a second copy beside it', () => {
    corrupt(r => { r.config = { ...CONFIG, startingBankroll: 1 } })
    expect(loadLiveSession()!.config.startingBankroll).toBe(5000)
  })

  it('forgives the betting screen: bets that are not numbers are dropped', () => {
    corrupt(r => { r.ui = { lastBets: [50, 'x', -3, null], keptPlaying: 'yes' } })
    expect(loadLiveSession()!.ui).toEqual({ lastBets: [50], keptPlaying: false })
  })
})

describe('whose table it is', () => {
  const signedInAs = (id: string | null) => {
    if (id === null) localStorage.removeItem(LOCAL_OWNER_KEY)
    else localStorage.setItem(LOCAL_OWNER_KEY, id)
  }

  it('is stamped with the owner of the local data, not chosen by the caller', () => {
    signedInAs('user-a')
    saveLiveSession(table())
    expect(loadLiveSession()!.owner).toBe('user-a')
  })

  it('belongs to nobody in particular where there are no accounts', () => {
    saveLiveSession(table())
    expect(loadLiveSession()!.owner).toBeNull()
  })

  it('is not loaded for another account, and is not deleted either', () => {
    signedInAs('user-a')
    saveLiveSession(table())
    const stored = localStorage.getItem(LIVE_SESSION_KEY)
    signedInAs('user-b')
    expect(loadLiveSession()).toBeNull()
    expect(loadSalvageableSession()).toBeNull()
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBe(stored)
    // ...and is there again for the one it belongs to.
    signedInAs('user-a')
    expect(loadLiveSession()!.id).toBe('table-1')
  })

  it('an account\'s table is not inherited by a device that has lost its owner record', () => {
    signedInAs('user-a')
    saveLiveSession(table())
    signedInAs(null)
    expect(loadLiveSession()).toBeNull()
  })

  it('a table without an owner is not handed to the account that signs in next', () => {
    saveLiveSession(table())
    signedInAs('user-b')
    expect(loadLiveSession()).toBeNull()
  })
})

describe('what can be salvaged of a record this build cannot continue', () => {
  const rewrite = (change: (r: Record<string, unknown>) => void) => {
    saveLiveSession(table())
    const record = JSON.parse(localStorage.getItem(LIVE_SESSION_KEY)!) as Record<string, unknown>
    change(record)
    localStorage.setItem(LIVE_SESSION_KEY, JSON.stringify(record))
  }
  const snap = (r: Record<string, unknown>) => r.snapshot as Record<string, unknown>

  it('is nothing for a table that loads normally', () => {
    saveLiveSession(table())
    expect(loadSalvageableSession()).toBeNull()
  })

  it('is the hands and the bankroll figures of a table whose shoe no longer reads', () => {
    rewrite(r => { (snap(r).shoe as { cards: number[] }).cards.length = 10 })
    expect(loadLiveSession()).toBeNull()
    expect(loadSalvageableSession()).toMatchObject({
      id: 'table-1', humanBankroll: 5120, peakBankroll: 5120, worstDrawdown: 0,
      handHistory: [], elapsedSeconds: 754, savedAt: 1_000_000,
    })
  })

  it('is read from a record of an older version', () => {
    rewrite(r => { r.version = LIVE_SESSION_VERSION - 1; snap(r).version = 0 })
    expect(loadSalvageableSession()!.humanBankroll).toBe(5120)
  })

  it('is not taken from a NEWER build: another tab may be playing that table', () => {
    rewrite(r => { r.version = LIVE_SESSION_VERSION + 1 })
    expect(loadSalvageableSession()).toBeNull()
    rewrite(r => { snap(r).version = 99 })
    expect(loadSalvageableSession()).toBeNull()
  })

  it('invents nothing: a missing bankroll figure means no salvage', () => {
    for (const field of ['humanBankroll', 'peakBankroll', 'worstDrawdown', 'handHistory', 'config']) {
      rewrite(r => { (snap(r).shoe as { cards: number[] }).cards.length = 10; delete snap(r)[field] })
      expect(loadSalvageableSession(), field).toBeNull()
    }
    rewrite(r => { (snap(r).shoe as { cards: number[] }).cards.length = 10; delete r.savedAt })
    expect(loadSalvageableSession()).toBeNull()
  })

  it('is not taken from another account\'s record', () => {
    rewrite(r => { (snap(r).shoe as { cards: number[] }).cards.length = 10; r.owner = 'someone-else' })
    expect(loadSalvageableSession()).toBeNull()
  })
})

describe('clearing', () => {
  it('removes the saved table', () => {
    saveLiveSession(table())
    clearLiveSession()
    expect(loadLiveSession()).toBeNull()
  })

  it('removes only the table it was asked about', () => {
    saveLiveSession(table('mine'))
    clearLiveSession('someone-elses')
    expect(loadLiveSession()!.id).toBe('mine')
    clearLiveSession('mine')
    expect(loadLiveSession()).toBeNull()
  })

  it('removes a record nobody can read, whoever asks', () => {
    localStorage.setItem(LIVE_SESSION_KEY, 'not json')
    clearLiveSession('any')
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
  })
})

describe('the right to record a session', () => {
  it('is given once', () => {
    saveLiveSession(table('t'))
    expect(claimRecording('t')).toBe(true)
    expect(claimRecording('t')).toBe(false)
    expect(claimRecording('t')).toBe(false)
    expect(isRecorded('t')).toBe(true)
  })

  it('takes the saved table with it', () => {
    saveLiveSession(table('t'))
    claimRecording('t')
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
  })

  it('leaves another table alone', () => {
    saveLiveSession(table('newer'))
    expect(claimRecording('older')).toBe(true)
    expect(loadLiveSession()!.id).toBe('newer')
  })

  it('is given for a session whose saved copy is already gone — the table in memory still counts', () => {
    expect(claimRecording('never-saved')).toBe(true)
    expect(claimRecording('never-saved')).toBe(false)
  })

  it('cannot be undone by a second tab saving the table again', () => {
    saveLiveSession(table('t'))
    claimRecording('t')
    expect(saveLiveSession(table('t'))).toBe(false)
    expect(loadLiveSession()).toBeNull()
  })

  it('drops a recorded table that is somehow still stored', () => {
    saveLiveSession(table('t'))
    const raw = localStorage.getItem(LIVE_SESSION_KEY)!
    claimRecording('t')
    localStorage.setItem(LIVE_SESSION_KEY, raw)
    expect(loadLiveSession()).toBeNull()
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
  })

  it('remembers a bounded number of ids', () => {
    for (let i = 0; i < 80; i++) claimRecording(`s-${i}`)
    const kept = JSON.parse(localStorage.getItem(RECORDED_IDS_KEY)!) as string[]
    expect(kept).toHaveLength(50)
    expect(isRecorded('s-79')).toBe(true)
  })

  it('survives a list that was damaged', () => {
    localStorage.setItem(RECORDED_IDS_KEY, '{oops')
    expect(claimRecording('t')).toBe(true)
    expect(claimRecording('t')).toBe(false)
  })
})

describe('abandoned', () => {
  it('is a table left for more than a day', () => {
    const savedAt = 5_000_000
    expect(isAbandoned({ savedAt }, savedAt + ABANDONED_AFTER_MS)).toBe(false)
    expect(isAbandoned({ savedAt }, savedAt + ABANDONED_AFTER_MS + 1)).toBe(true)
    expect(isAbandoned({ savedAt }, savedAt + 60_000)).toBe(false)
    expect(ABANDONED_AFTER_MS).toBe(24 * 60 * 60 * 1000)
  })

  it('is not a table saved in the future by a clock that was wrong', () => {
    expect(isAbandoned({ savedAt: 9_000_000 }, 1_000)).toBe(false)
  })
})
