import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useChallengeStore } from './challenge-store'
import type { TrainingSessionResult } from '../services/stats-types'

// Mock the dailyChallengeEngine singleton
vi.mock('../services/challenges/daily-challenge', () => {
  const mockEngine = {
    getTodayChallenge: vi.fn(() => ({
      id: 'warm_up',
      title: 'Warm Up',
      description: 'Complete 2 training sessions today',
      icon: '\u2615',
      type: 'play_sessions',
      difficulty: 'easy',
      target: 2,
      progressMode: 'cumulative_today',
    })),
    getState: vi.fn(() => ({
      challengeId: 'warm_up',
      date: '2026-03-26',
      progress: 0,
      completed: false,
      completedAt: null,
    })),
    getStreak: vi.fn(() => 0),
    getTotalCompleted: vi.fn(() => 0),
    getTotalXP: vi.fn(() => 0),
    updateProgress: vi.fn(() => false),
    resetAll: vi.fn(),
  }
  return { dailyChallengeEngine: mockEngine }
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
import { dailyChallengeEngine } from '../services/challenges/daily-challenge'
import { soundEngine } from '../services/sound-engine'

/** Helper: minimal session result. */
function makeSession(): TrainingSessionResult {
  return {
    id: 'test-id',
    mode: 'speedDrill',
    timestamp: '2026-03-26T12:00:00.000Z',
    countingSystem: 'hiLo',
    durationSeconds: 120,
    totalQuestions: 20,
    correctAnswers: 16,
    accuracy: 0.8,
    bestStreak: 5,
    details: { type: 'speedDrill', cardsPerRound: 10, speedMs: 1000, rcErrors: [] },
  }
}

describe('useChallengeStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset store state
    useChallengeStore.setState({
      challenge: (dailyChallengeEngine.getTodayChallenge as ReturnType<typeof vi.fn>)(),
      state: (dailyChallengeEngine.getState as ReturnType<typeof vi.fn>)(),
      streak: 0,
      totalCompleted: 0,
      totalXP: 0,
      justCompleted: false,
    })
  })

  it('initializes with data from the engine', () => {
    const store = useChallengeStore.getState()
    expect(store.challenge.id).toBe('warm_up')
    expect(store.state.progress).toBe(0)
    expect(store.streak).toBe(0)
    expect(store.justCompleted).toBe(false)
  })

  it('updateProgress calls engine and updates store state', () => {
    const session = makeSession()
    const todaySessions = [session]

    // Engine returns false (not completed)
    ;(dailyChallengeEngine.updateProgress as ReturnType<typeof vi.fn>).mockReturnValue(false)
    ;(dailyChallengeEngine.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      challengeId: 'warm_up',
      date: '2026-03-26',
      progress: 1,
      completed: false,
      completedAt: null,
    })
    ;(dailyChallengeEngine.getStreak as ReturnType<typeof vi.fn>).mockReturnValue(0)

    useChallengeStore.getState().updateProgress(session, todaySessions)

    expect(dailyChallengeEngine.updateProgress).toHaveBeenCalledWith(session, todaySessions)
    expect(useChallengeStore.getState().state.progress).toBe(1)
    expect(useChallengeStore.getState().justCompleted).toBe(false)
    expect(soundEngine.sessionComplete).not.toHaveBeenCalled()
  })

  it('plays sessionComplete sound and sets justCompleted on completion', () => {
    const session = makeSession()
    const todaySessions = [session, session]

    ;(dailyChallengeEngine.updateProgress as ReturnType<typeof vi.fn>).mockReturnValue(true)
    ;(dailyChallengeEngine.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      challengeId: 'warm_up',
      date: '2026-03-26',
      progress: 2,
      completed: true,
      completedAt: '2026-03-26T14:00:00.000Z',
    })
    ;(dailyChallengeEngine.getStreak as ReturnType<typeof vi.fn>).mockReturnValue(1)
    ;(dailyChallengeEngine.getTotalCompleted as ReturnType<typeof vi.fn>).mockReturnValue(1)
    ;(dailyChallengeEngine.getTotalXP as ReturnType<typeof vi.fn>).mockReturnValue(50)

    useChallengeStore.getState().updateProgress(session, todaySessions)

    expect(useChallengeStore.getState().justCompleted).toBe(true)
    expect(useChallengeStore.getState().state.completed).toBe(true)
    expect(useChallengeStore.getState().streak).toBe(1)
    expect(useChallengeStore.getState().totalCompleted).toBe(1)
    expect(useChallengeStore.getState().totalXP).toBe(50)
    expect(soundEngine.sessionComplete).toHaveBeenCalledOnce()
  })

  it('dismissCompletion clears justCompleted flag', () => {
    useChallengeStore.setState({ justCompleted: true })
    useChallengeStore.getState().dismissCompletion()
    expect(useChallengeStore.getState().justCompleted).toBe(false)
  })

  it('refresh reloads all state from engine', () => {
    ;(dailyChallengeEngine.getTodayChallenge as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'deal_me_in',
      title: 'Deal Me In',
      description: 'Play 30 hands in any mode',
      icon: '\uD83C\uDCCF',
      type: 'play_hands',
      difficulty: 'easy',
      target: 30,
      progressMode: 'cumulative_today',
    })
    ;(dailyChallengeEngine.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      challengeId: 'deal_me_in',
      date: '2026-03-27',
      progress: 0,
      completed: false,
      completedAt: null,
    })
    ;(dailyChallengeEngine.getStreak as ReturnType<typeof vi.fn>).mockReturnValue(5)
    ;(dailyChallengeEngine.getTotalCompleted as ReturnType<typeof vi.fn>).mockReturnValue(10)
    ;(dailyChallengeEngine.getTotalXP as ReturnType<typeof vi.fn>).mockReturnValue(800)

    useChallengeStore.getState().refresh()

    expect(useChallengeStore.getState().challenge.id).toBe('deal_me_in')
    expect(useChallengeStore.getState().state.date).toBe('2026-03-27')
    expect(useChallengeStore.getState().streak).toBe(5)
    expect(useChallengeStore.getState().totalCompleted).toBe(10)
    expect(useChallengeStore.getState().totalXP).toBe(800)
  })

  it('resetAll delegates to engine and clears store', () => {
    useChallengeStore.setState({ justCompleted: true, streak: 5, totalCompleted: 10, totalXP: 800 })

    ;(dailyChallengeEngine.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      challengeId: 'warm_up',
      date: '2026-03-26',
      progress: 0,
      completed: false,
      completedAt: null,
    })
    ;(dailyChallengeEngine.getStreak as ReturnType<typeof vi.fn>).mockReturnValue(0)
    ;(dailyChallengeEngine.getTotalCompleted as ReturnType<typeof vi.fn>).mockReturnValue(0)
    ;(dailyChallengeEngine.getTotalXP as ReturnType<typeof vi.fn>).mockReturnValue(0)

    useChallengeStore.getState().resetAll()

    expect(dailyChallengeEngine.resetAll).toHaveBeenCalledOnce()
    expect(useChallengeStore.getState().justCompleted).toBe(false)
    expect(useChallengeStore.getState().streak).toBe(0)
    expect(useChallengeStore.getState().totalCompleted).toBe(0)
    expect(useChallengeStore.getState().totalXP).toBe(0)
  })
})
