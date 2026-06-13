import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useWeeklyChallengeStore } from './weekly-challenge-store'
import type { TrainingSessionResult } from '../services/stats-types'

// Mock the weeklyChallengeEngine singleton
vi.mock('../services/challenges/weekly-challenge', () => {
  const mockEngine = {
    getThisWeekChallenge: vi.fn(() => ({
      id: 'weekly_grinder',
      title: 'Weekly Grinder',
      description: 'Play 200 hands across any modes this week',
      icon: '\uD83D\uDCC5',
      type: 'play_hands',
      difficulty: 'medium',
      xpReward: 300,
      target: 200,
    })),
    getState: vi.fn(() => ({
      challengeId: 'weekly_grinder',
      weekId: '2026-03-23',
      progress: 0,
      completed: false,
      completedAt: null,
    })),
    getStreak: vi.fn(() => 0),
    getTotalCompleted: vi.fn(() => 0),
    getTotalXP: vi.fn(() => 0),
    getTimeRemaining: vi.fn(() => ({ days: 4, hours: 11, minutes: 59 })),
    updateProgress: vi.fn(() => false),
    resetAll: vi.fn(),
  }
  return { weeklyChallengeEngine: mockEngine }
})

// Mock sound engine
vi.mock('../services/sound-engine', () => ({
  soundEngine: {
    sessionComplete: vi.fn(),
    levelUp: vi.fn(),
  },
}))

// Mock level store (prevents side effects from addChallengeXP)
vi.mock('./level-store', () => ({
  useLevelStore: {
    getState: () => ({ addChallengeXP: vi.fn() }),
  },
}))

// Import after mocks
import { weeklyChallengeEngine } from '../services/challenges/weekly-challenge'
import { soundEngine } from '../services/sound-engine'

/** Helper: minimal session result. */
function makeSession(): TrainingSessionResult {
  return {
    id: 'test-id',
    mode: 'speedDrill',
    timestamp: '2026-03-25T12:00:00.000Z',
    countingSystem: 'hiLo',
    durationSeconds: 120,
    totalQuestions: 20,
    correctAnswers: 16,
    accuracy: 0.8,
    bestStreak: 5,
    details: { type: 'speedDrill', cardsPerRound: 10, speedMs: 1000, rcErrors: [] },
  }
}

describe('useWeeklyChallengeStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset store state
    useWeeklyChallengeStore.setState({
      challenge: (weeklyChallengeEngine.getThisWeekChallenge as ReturnType<typeof vi.fn>)(),
      state: (weeklyChallengeEngine.getState as ReturnType<typeof vi.fn>)(),
      streak: 0,
      totalCompleted: 0,
      totalXP: 0,
      justCompleted: false,
    })
  })

  it('initializes with data from the engine', () => {
    const store = useWeeklyChallengeStore.getState()
    expect(store.challenge.id).toBe('weekly_grinder')
    expect(store.state.progress).toBe(0)
    expect(store.streak).toBe(0)
    expect(store.justCompleted).toBe(false)
  })

  it('updateProgress calls engine and updates store state', () => {
    const session = makeSession()
    const weekSessions = [session]

    ;(weeklyChallengeEngine.updateProgress as ReturnType<typeof vi.fn>).mockReturnValue(false)
    ;(weeklyChallengeEngine.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      challengeId: 'weekly_grinder',
      weekId: '2026-03-23',
      progress: 20,
      completed: false,
      completedAt: null,
    })
    ;(weeklyChallengeEngine.getStreak as ReturnType<typeof vi.fn>).mockReturnValue(0)

    useWeeklyChallengeStore.getState().updateProgress(session, weekSessions)

    expect(weeklyChallengeEngine.updateProgress).toHaveBeenCalledWith(session, weekSessions)
    expect(useWeeklyChallengeStore.getState().state.progress).toBe(20)
    expect(useWeeklyChallengeStore.getState().justCompleted).toBe(false)
    expect(soundEngine.sessionComplete).not.toHaveBeenCalled()
  })

  it('plays sessionComplete sound and sets justCompleted on completion', () => {
    const session = makeSession()
    const weekSessions = Array(10).fill(session)

    ;(weeklyChallengeEngine.updateProgress as ReturnType<typeof vi.fn>).mockReturnValue(true)
    ;(weeklyChallengeEngine.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      challengeId: 'weekly_grinder',
      weekId: '2026-03-23',
      progress: 200,
      completed: true,
      completedAt: '2026-03-27T14:00:00.000Z',
    })
    ;(weeklyChallengeEngine.getStreak as ReturnType<typeof vi.fn>).mockReturnValue(1)
    ;(weeklyChallengeEngine.getTotalCompleted as ReturnType<typeof vi.fn>).mockReturnValue(1)
    ;(weeklyChallengeEngine.getTotalXP as ReturnType<typeof vi.fn>).mockReturnValue(300)

    useWeeklyChallengeStore.getState().updateProgress(session, weekSessions)

    expect(useWeeklyChallengeStore.getState().justCompleted).toBe(true)
    expect(useWeeklyChallengeStore.getState().state.completed).toBe(true)
    expect(useWeeklyChallengeStore.getState().streak).toBe(1)
    expect(useWeeklyChallengeStore.getState().totalCompleted).toBe(1)
    expect(useWeeklyChallengeStore.getState().totalXP).toBe(300)
    expect(soundEngine.sessionComplete).toHaveBeenCalledOnce()
  })

  it('dismissCompletion clears justCompleted flag', () => {
    useWeeklyChallengeStore.setState({ justCompleted: true })
    useWeeklyChallengeStore.getState().dismissCompletion()
    expect(useWeeklyChallengeStore.getState().justCompleted).toBe(false)
  })

  it('refresh reloads all state from engine', () => {
    ;(weeklyChallengeEngine.getThisWeekChallenge as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'marathon_week',
      title: 'Marathon Week',
      description: 'Play 500 hands across any modes',
      icon: '\uD83C\uDFC3',
      type: 'play_hands',
      difficulty: 'hard',
      xpReward: 500,
      target: 500,
    })
    ;(weeklyChallengeEngine.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      challengeId: 'marathon_week',
      weekId: '2026-03-30',
      progress: 0,
      completed: false,
      completedAt: null,
    })
    ;(weeklyChallengeEngine.getStreak as ReturnType<typeof vi.fn>).mockReturnValue(3)
    ;(weeklyChallengeEngine.getTotalCompleted as ReturnType<typeof vi.fn>).mockReturnValue(5)
    ;(weeklyChallengeEngine.getTotalXP as ReturnType<typeof vi.fn>).mockReturnValue(2100)

    useWeeklyChallengeStore.getState().refresh()

    expect(useWeeklyChallengeStore.getState().challenge.id).toBe('marathon_week')
    expect(useWeeklyChallengeStore.getState().state.weekId).toBe('2026-03-30')
    expect(useWeeklyChallengeStore.getState().streak).toBe(3)
    expect(useWeeklyChallengeStore.getState().totalCompleted).toBe(5)
    expect(useWeeklyChallengeStore.getState().totalXP).toBe(2100)
  })

  it('resetAll delegates to engine and clears store', () => {
    useWeeklyChallengeStore.setState({ justCompleted: true, streak: 3, totalCompleted: 5, totalXP: 2100 })

    ;(weeklyChallengeEngine.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      challengeId: 'weekly_grinder',
      weekId: '2026-03-23',
      progress: 0,
      completed: false,
      completedAt: null,
    })
    ;(weeklyChallengeEngine.getStreak as ReturnType<typeof vi.fn>).mockReturnValue(0)
    ;(weeklyChallengeEngine.getTotalCompleted as ReturnType<typeof vi.fn>).mockReturnValue(0)
    ;(weeklyChallengeEngine.getTotalXP as ReturnType<typeof vi.fn>).mockReturnValue(0)

    useWeeklyChallengeStore.getState().resetAll()

    expect(weeklyChallengeEngine.resetAll).toHaveBeenCalledOnce()
    expect(useWeeklyChallengeStore.getState().justCompleted).toBe(false)
    expect(useWeeklyChallengeStore.getState().streak).toBe(0)
    expect(useWeeklyChallengeStore.getState().totalCompleted).toBe(0)
    expect(useWeeklyChallengeStore.getState().totalXP).toBe(0)
  })
})
