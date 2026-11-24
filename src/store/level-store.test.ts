import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useLevelStore, awardLines, AWARD_MAX_LINES, AWARD_MERGE_MS } from './level-store'
import type { TrainingSessionResult } from '../services/stats-types'
import { CountingSystemId } from '../engine/counting/types'

// Mock the levelSystem singleton
vi.mock('../services/level-system', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/level-system')>()
  const mockSystem = {
    getLevel: vi.fn(() => actual.LEVELS[0]),
    getProgressToNext: vi.fn(() => ({ current: 0, required: 50, percent: 0 })),
    addXP: vi.fn(() => ({ leveledUp: false })),
    getTotalXP: vi.fn(() => 0),
    resetAll: vi.fn(),
    reload: vi.fn(),
  }
  return {
    ...actual,
    levelSystem: mockSystem,
    sessionXP: vi.fn(() => ({ amount: 10, earned: 10, capped: false, base: 10, bonus: 0 })),
  }
})

// Mock sound engine
vi.mock('../services/sound-engine', () => ({
  soundEngine: {
    levelUp: vi.fn(),
  },
}))

// Import after mocks
import { levelSystem, LEVELS, sessionXP } from '../services/level-system'
import { soundEngine } from '../services/sound-engine'

/** Helper: minimal session result. */
function makeSession(): TrainingSessionResult {
  return {
    id: 'test-id',
    mode: 'speedDrill',
    timestamp: '2026-03-26T12:00:00.000Z',
    countingSystem: CountingSystemId.HiLo,
    durationSeconds: 120,
    totalQuestions: 20,
    correctAnswers: 16,
    accuracy: 0.8,
    bestStreak: 5,
    details: { type: 'speedDrill', cardsPerRound: 10, speedMs: 1000, rcErrors: [] },
  }
}

describe('useLevelStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset store state
    useLevelStore.setState({
      totalXP: 0,
      level: LEVELS[0],
      progress: { current: 0, required: 50, percent: 0 },
      showLevelUp: false,
      levelUpData: null,
      // Each test starts with no toast on screen: one that is still fresh
      // would have the next payout added to it.
      lastAward: null,
    })
  })

  it('initializes with level 1 data from engine', () => {
    const store = useLevelStore.getState()
    expect(store.level.level).toBe(1)
    expect(store.totalXP).toBe(0)
    expect(store.progress.percent).toBe(0)
    expect(store.showLevelUp).toBe(false)
  })

  it('addSessionXP asks what the session pays and credits it', () => {
    const session = makeSession()
    ;(sessionXP as ReturnType<typeof vi.fn>).mockReturnValue({ amount: 15, earned: 15, capped: false, base: 15, bonus: 0 })
    ;(levelSystem.addXP as ReturnType<typeof vi.fn>).mockReturnValue({ leveledUp: false })
    ;(levelSystem.getTotalXP as ReturnType<typeof vi.fn>).mockReturnValue(15)
    ;(levelSystem.getLevel as ReturnType<typeof vi.fn>).mockReturnValue(LEVELS[0])
    ;(levelSystem.getProgressToNext as ReturnType<typeof vi.fn>).mockReturnValue({
      current: 15, required: 50, percent: 30,
    })

    useLevelStore.getState().addSessionXP(session)

    expect(sessionXP).toHaveBeenCalledWith(session, [])
    expect(levelSystem.addXP).toHaveBeenCalledWith(15)
    expect(useLevelStore.getState().totalXP).toBe(15)
    expect(useLevelStore.getState().progress.percent).toBe(30)
    expect(useLevelStore.getState().showLevelUp).toBe(false)
  })

  it('says so when the day’s limit took part of a session, or all of it', () => {
    ;(levelSystem.addXP as ReturnType<typeof vi.fn>).mockReturnValue({ leveledUp: false })
    ;(sessionXP as ReturnType<typeof vi.fn>).mockReturnValue({ amount: 30, earned: 60, capped: true, base: 30, bonus: 0 })
    useLevelStore.getState().addSessionXP(makeSession())
    expect(useLevelStore.getState().lastAward).toMatchObject({ amount: 30, labelKey: 'xp.source.sessionCapped' })

    // Nothing left to pay: no XP is added, but the session is not met with silence.
    // (The toast of the session before has gone by the time the next one ends.)
    useLevelStore.setState({ lastAward: null })
    ;(levelSystem.addXP as ReturnType<typeof vi.fn>).mockClear()
    ;(sessionXP as ReturnType<typeof vi.fn>).mockReturnValue({ amount: 0, earned: 60, capped: true, base: 0, bonus: 0 })
    useLevelStore.getState().addSessionXP(makeSession())
    expect(levelSystem.addXP).not.toHaveBeenCalled()
    expect(useLevelStore.getState().lastAward).toMatchObject({ amount: 0, labelKey: 'xp.source.dailyCap' })

    // A session that earned nothing announces nothing.
    useLevelStore.setState({ lastAward: null })
    ;(sessionXP as ReturnType<typeof vi.fn>).mockReturnValue({ amount: 0, earned: 0, capped: false, base: 0, bonus: 0 })
    useLevelStore.getState().addSessionXP(makeSession())
    expect(useLevelStore.getState().lastAward).toBeNull()
  })

  it('triggers level-up popup and plays sound on level-up', () => {
    const session = makeSession()
    ;(sessionXP as ReturnType<typeof vi.fn>).mockReturnValue({ amount: 50, earned: 50, capped: false, base: 50, bonus: 0 })
    ;(levelSystem.addXP as ReturnType<typeof vi.fn>).mockReturnValue({
      leveledUp: true,
      oldLevel: LEVELS[0],
      newLevel: LEVELS[1],
    })
    ;(levelSystem.getTotalXP as ReturnType<typeof vi.fn>).mockReturnValue(50)
    ;(levelSystem.getLevel as ReturnType<typeof vi.fn>).mockReturnValue(LEVELS[1])
    ;(levelSystem.getProgressToNext as ReturnType<typeof vi.fn>).mockReturnValue({
      current: 0, required: 150, percent: 0,
    })

    useLevelStore.getState().addSessionXP(session)

    expect(useLevelStore.getState().showLevelUp).toBe(true)
    expect(useLevelStore.getState().levelUpData?.oldLevel.level).toBe(1)
    expect(useLevelStore.getState().levelUpData?.newLevel.level).toBe(2)
    expect(soundEngine.levelUp).toHaveBeenCalledOnce()
  })

  it('addChallengeXP adds the given amount', () => {
    ;(levelSystem.addXP as ReturnType<typeof vi.fn>).mockReturnValue({ leveledUp: false })
    ;(levelSystem.getTotalXP as ReturnType<typeof vi.fn>).mockReturnValue(100)
    ;(levelSystem.getLevel as ReturnType<typeof vi.fn>).mockReturnValue(LEVELS[1])
    ;(levelSystem.getProgressToNext as ReturnType<typeof vi.fn>).mockReturnValue({
      current: 50, required: 150, percent: 33,
    })

    useLevelStore.getState().addChallengeXP(100)

    expect(levelSystem.addXP).toHaveBeenCalledWith(100)
    expect(useLevelStore.getState().totalXP).toBe(100)
  })

  it('addAchievementXP maps tier to XP amount', () => {
    ;(levelSystem.addXP as ReturnType<typeof vi.fn>).mockReturnValue({ leveledUp: false })
    ;(levelSystem.getTotalXP as ReturnType<typeof vi.fn>).mockReturnValue(50)
    ;(levelSystem.getLevel as ReturnType<typeof vi.fn>).mockReturnValue(LEVELS[1])
    ;(levelSystem.getProgressToNext as ReturnType<typeof vi.fn>).mockReturnValue({
      current: 0, required: 150, percent: 0,
    })

    useLevelStore.getState().addAchievementXP('gold')
    expect(levelSystem.addXP).toHaveBeenCalledWith(100) // gold = 100
  })

  it('addAchievementXP handles all tiers', () => {
    const mockReturn = { leveledUp: false }
    ;(levelSystem.addXP as ReturnType<typeof vi.fn>).mockReturnValue(mockReturn)
    ;(levelSystem.getTotalXP as ReturnType<typeof vi.fn>).mockReturnValue(0)
    ;(levelSystem.getLevel as ReturnType<typeof vi.fn>).mockReturnValue(LEVELS[0])
    ;(levelSystem.getProgressToNext as ReturnType<typeof vi.fn>).mockReturnValue({
      current: 0, required: 50, percent: 0,
    })

    useLevelStore.getState().addAchievementXP('bronze')
    expect(levelSystem.addXP).toHaveBeenCalledWith(25)

    useLevelStore.getState().addAchievementXP('silver')
    expect(levelSystem.addXP).toHaveBeenCalledWith(50)

    useLevelStore.getState().addAchievementXP('diamond')
    expect(levelSystem.addXP).toHaveBeenCalledWith(200)
  })

  it('addAchievementsXP sums the tiers and applies XP once', () => {
    ;(levelSystem.addXP as ReturnType<typeof vi.fn>).mockReturnValue({ leveledUp: false })
    ;(levelSystem.getTotalXP as ReturnType<typeof vi.fn>).mockReturnValue(0)
    ;(levelSystem.getLevel as ReturnType<typeof vi.fn>).mockReturnValue(LEVELS[0])
    ;(levelSystem.getProgressToNext as ReturnType<typeof vi.fn>).mockReturnValue({
      current: 0, required: 50, percent: 0,
    })

    useLevelStore.getState().addAchievementsXP(['bronze', 'gold', 'diamond'])
    // 25 + 100 + 200, applied in a single addXP call (one popup, one cloud push).
    expect(levelSystem.addXP).toHaveBeenCalledTimes(1)
    expect(levelSystem.addXP).toHaveBeenCalledWith(325)
  })

  it('addAchievementsXP does nothing for an empty list', () => {
    useLevelStore.getState().addAchievementsXP([])
    expect(levelSystem.addXP).not.toHaveBeenCalled()
  })

  it('dismissLevelUp clears the popup', () => {
    useLevelStore.setState({
      showLevelUp: true,
      levelUpData: { oldLevel: LEVELS[0], newLevel: LEVELS[1], breakdown: [] },
    })
    useLevelStore.getState().dismissLevelUp()
    expect(useLevelStore.getState().showLevelUp).toBe(false)
    expect(useLevelStore.getState().levelUpData).toBeNull()
  })

  it('refresh reloads from engine', () => {
    ;(levelSystem.getTotalXP as ReturnType<typeof vi.fn>).mockReturnValue(500)
    ;(levelSystem.getLevel as ReturnType<typeof vi.fn>).mockReturnValue(LEVELS[3])
    ;(levelSystem.getProgressToNext as ReturnType<typeof vi.fn>).mockReturnValue({
      current: 0, required: 500, percent: 0,
    })

    useLevelStore.getState().refresh()

    expect(useLevelStore.getState().totalXP).toBe(500)
    expect(useLevelStore.getState().level.level).toBe(4)
  })

  /**
   * What the toast is told (21 Nov 2026).
   *
   * One label per payout meant "+110 XP Training session — new personal best"
   * for a session that was 40 for its answers, 20 for its accuracy and 50 for
   * the record, and it meant that a stage finished by that same session
   * replaced the line altogether. The award now carries its parts.
   */
  describe('the award carries its parts', () => {
    const mockXP = (v: { amount: number; earned: number; capped: boolean; base: number; bonus: number }) =>
      (sessionXP as ReturnType<typeof vi.fn>).mockReturnValue(v)
    const award = () => useLevelStore.getState().lastAward!
    const sum = (parts: { amount: number }[]) => parts.reduce((n, p) => n + p.amount, 0)
    /** Everything `levelSystem.addXP` was asked to credit. */
    const credited = () =>
      (levelSystem.addXP as ReturnType<typeof vi.fn>).mock.calls.reduce((n, c) => n + (c[0] as number), 0)

    beforeEach(() => {
      useLevelStore.setState({ lastAward: null })
      ;(levelSystem.addXP as ReturnType<typeof vi.fn>).mockReturnValue({ leveledUp: false })
    })

    it('a session that is only its answers is one part and one line', () => {
      mockXP({ amount: 32, earned: 32, capped: false, base: 32, bonus: 0 })
      useLevelStore.getState().addSessionXP(makeSession())
      expect(award().parts).toEqual([{ labelKey: 'xp.part.correct', amount: 32 }])
      expect(award().labelKey).toBe('xp.source.session')
      expect(award().amount).toBe(32)
    })

    it('answers and accuracy are two parts that add up to the credit', () => {
      mockXP({ amount: 60, earned: 60, capped: false, base: 40, bonus: 20 })
      useLevelStore.getState().addSessionXP(makeSession())
      expect(award().parts).toEqual([
        { labelKey: 'xp.part.correct', amount: 40 },
        { labelKey: 'xp.part.accuracy', amount: 20 },
      ])
      // More than one line to show, so no single label claims to say it all.
      expect(award().labelKey).toBeUndefined()
      expect(sum(award().parts)).toBe(60)
      expect(award().amount).toBe(credited())
    })

    it('a limit that cut the session short is a remark, not an amount', () => {
      mockXP({ amount: 30, earned: 60, capped: true, base: 30, bonus: 0 })
      useLevelStore.getState().addSessionXP(makeSession())
      expect(award().parts).toEqual([{ labelKey: 'xp.part.correct', amount: 30 }])
      expect(award().noteKey).toBe('xp.part.dailyCap')
      expect(sum(award().parts)).toBe(credited())
    })

    it('payouts that land together are one announcement, and still add up', () => {
      // A session, the stage it finished, the week it completed, an award.
      mockXP({ amount: 60, earned: 60, capped: false, base: 40, bonus: 20 })
      const store = useLevelStore.getState()
      store.addSessionXP(makeSession())
      store.addChallengeXP(250, 'plan.stageComplete', { stage: 'Hi-Lo' })
      store.addChallengeXP(60, 'xp.source.weekGoal')
      store.addAchievementsXP(['bronze'])

      const a = award()
      expect(a.parts.map(p => p.labelKey)).toEqual([
        'xp.part.correct', 'xp.part.accuracy', 'plan.stageComplete', 'xp.source.weekGoal', 'xp.source.achievements',
      ])
      expect(a.amount).toBe(40 + 20 + 250 + 60 + 25)
      expect(a.amount).toBe(sum(a.parts))
      expect(a.amount).toBe(credited())
      expect(a.labelKey).toBeUndefined()
    })

    it('every new part re-arms the toast', () => {
      const store = useLevelStore.getState()
      store.addChallengeXP(100)
      const first = award().id
      store.addChallengeXP(60, 'xp.source.weekGoal')
      expect(award().id).toBeGreaterThan(first)
    })

    it('a payout long after the last one is an announcement of its own', () => {
      vi.useFakeTimers()
      try {
        const store = useLevelStore.getState()
        store.addChallengeXP(100)
        vi.advanceTimersByTime(AWARD_MERGE_MS + 1)
        store.addChallengeXP(60, 'xp.source.weekGoal')
        expect(award().parts).toEqual([{ labelKey: 'xp.source.weekGoal', labelParams: undefined, amount: 60 }])
        expect(award().labelKey).toBe('xp.source.weekGoal')
        expect(award().amount).toBe(60)
      } finally {
        vi.useRealTimers()
      }
    })

    it('a dismissed toast is never added to', () => {
      const store = useLevelStore.getState()
      store.addChallengeXP(100)
      store.dismissXpAward()
      store.addChallengeXP(60, 'xp.source.weekGoal')
      expect(award().amount).toBe(60)
    })

    it('a session the limit left nothing of still joins what else was paid', () => {
      mockXP({ amount: 0, earned: 60, capped: true, base: 0, bonus: 0 })
      const store = useLevelStore.getState()
      store.addSessionXP(makeSession())
      expect(award()).toMatchObject({ amount: 0, parts: [], labelKey: 'xp.source.dailyCap' })
      store.addChallengeXP(250, 'plan.stageComplete', { stage: 'Hi-Lo' })
      expect(award().amount).toBe(250)
      expect(award().noteKey).toBe('xp.part.dailyCap')
      // Not "+250 XP — daily limit reached" on one line: two things, two lines.
      expect(award().labelKey).toBeUndefined()
      expect(awardLines(award()).map(l => l.labelKey)).toEqual(['plan.stageComplete', 'xp.part.dailyCap'])
    })
  })

  describe('awardLines — three lines at most', () => {
    const part = (labelKey: string, amount: number) => ({ labelKey, amount })
    const total = (lines: { amount?: number }[]) => lines.reduce((n, l) => n + (l.amount ?? 0), 0)

    it('lists up to three parts as they are', () => {
      const parts = [part('a', 40), part('b', 10), part('c', 50)]
      expect(awardLines({ parts })).toEqual(parts)
    })

    it('folds a fourth and fifth into one line, keeping the two largest', () => {
      const parts = [part('correct', 40), part('accuracy', 20), part('stage', 250), part('week', 60), part('awards', 25)]
      const lines = awardLines({ parts })
      expect(lines).toHaveLength(AWARD_MAX_LINES)
      expect(lines.map(l => l.labelKey)).toEqual(['stage', 'week', 'xp.part.other'])
      expect(lines[2].amount).toBe(40 + 20 + 25)
      expect(total(lines)).toBe(395)
    })

    it('never shows more than three, with or without the remark', () => {
      for (let n = 0; n <= 8; n++) {
        const parts = Array.from({ length: n }, (_, i) => part(`p${i}`, 10 + i))
        for (const noteKey of [undefined, 'xp.part.dailyCap']) {
          const lines = awardLines({ parts, noteKey })
          expect(lines.length).toBeLessThanOrEqual(AWARD_MAX_LINES)
          // Whatever is folded, nothing is lost.
          expect(total(lines)).toBe(parts.reduce((s, p) => s + p.amount, 0))
        }
      }
    })

    it('shows the remark when there is a line left for it', () => {
      expect(awardLines({ parts: [part('a', 30), part('b', 250)], noteKey: 'xp.part.dailyCap' }).map(l => l.labelKey))
        .toEqual(['a', 'b', 'xp.part.dailyCap'])
      expect(awardLines({ parts: [part('a', 30), part('b', 250), part('c', 60)], noteKey: 'xp.part.dailyCap' }).map(l => l.labelKey))
        .toEqual(['a', 'b', 'c'])
    })
  })
})

describe('useLevelStore — an award shown in place', () => {
  beforeEach(() => {
    useLevelStore.setState({ lastAward: null, awardInPlace: false, awardSeenId: 0 })
  })

  it('holds the toast back until released, and remembers the award as seen', () => {
    const store = useLevelStore.getState()
    store.holdAwardInPlace()
    expect(useLevelStore.getState().awardInPlace).toBe(true)
    useLevelStore.setState({ lastAward: { id: 12, amount: 30, parts: [{ labelKey: 'xp.part.correct', amount: 30 }], at: Date.now() } })
    store.releaseAwardInPlace()
    expect(useLevelStore.getState().awardInPlace).toBe(false)
    expect(useLevelStore.getState().awardSeenId).toBe(12)
    // The award itself stays: a screen mounting again (StrictMode) still finds it.
    expect(useLevelStore.getState().lastAward?.id).toBe(12)
  })

  it('a release without a hold changes nothing', () => {
    useLevelStore.setState({ lastAward: { id: 5, amount: 10, parts: [], at: 0 } })
    useLevelStore.getState().releaseAwardInPlace()
    expect(useLevelStore.getState().awardSeenId).toBe(0)
  })
})
