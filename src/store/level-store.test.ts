import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useLevelStore } from './level-store'
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
    calculateSessionXP: vi.fn(() => 10),
  }
})

// Mock sound engine
vi.mock('../services/sound-engine', () => ({
  soundEngine: {
    levelUp: vi.fn(),
  },
}))

// Import after mocks
import { levelSystem, LEVELS, calculateSessionXP } from '../services/level-system'
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
    })
  })

  it('initializes with level 1 data from engine', () => {
    const store = useLevelStore.getState()
    expect(store.level.level).toBe(1)
    expect(store.totalXP).toBe(0)
    expect(store.progress.percent).toBe(0)
    expect(store.showLevelUp).toBe(false)
  })

  it('addSessionXP calls calculateSessionXP and engine.addXP', () => {
    const session = makeSession()
    ;(calculateSessionXP as ReturnType<typeof vi.fn>).mockReturnValue(15)
    ;(levelSystem.addXP as ReturnType<typeof vi.fn>).mockReturnValue({ leveledUp: false })
    ;(levelSystem.getTotalXP as ReturnType<typeof vi.fn>).mockReturnValue(15)
    ;(levelSystem.getLevel as ReturnType<typeof vi.fn>).mockReturnValue(LEVELS[0])
    ;(levelSystem.getProgressToNext as ReturnType<typeof vi.fn>).mockReturnValue({
      current: 15, required: 50, percent: 30,
    })

    useLevelStore.getState().addSessionXP(session)

    expect(calculateSessionXP).toHaveBeenCalledWith(session)
    expect(levelSystem.addXP).toHaveBeenCalledWith(15)
    expect(useLevelStore.getState().totalXP).toBe(15)
    expect(useLevelStore.getState().progress.percent).toBe(30)
    expect(useLevelStore.getState().showLevelUp).toBe(false)
  })

  it('triggers level-up popup and plays sound on level-up', () => {
    const session = makeSession()
    ;(calculateSessionXP as ReturnType<typeof vi.fn>).mockReturnValue(50)
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
})
