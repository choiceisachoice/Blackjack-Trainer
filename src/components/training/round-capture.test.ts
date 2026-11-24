import { describe, it, expect, beforeEach } from 'vitest'
import { captureRound } from './round-capture'
import { useLevelStore } from '../../store/level-store'
import { useStatsStore } from '../../store/stats-store'
import { useAchievementStore } from '../../store/achievement-store'
import type { TrainingSessionResult } from '../../services/stats-types'
import { CountingSystemId } from '../../types'

const old: TrainingSessionResult = {
  id: 'old', mode: 'speedDrill', timestamp: '2026-11-01T10:00:00.000Z', countingSystem: CountingSystemId.HiLo,
  durationSeconds: 60, totalQuestions: 3, correctAnswers: 3, accuracy: 1, bestStreak: 3,
  details: { type: 'speedDrill', cardsPerRound: 20, speedMs: 1000, rcErrors: [0, 0, 0] },
}

beforeEach(() => {
  localStorage.clear()
  useStatsStore.setState({ sessions: [old] })
  useLevelStore.setState({
    lastAward: { id: 41, amount: 10, parts: [{ labelKey: 'xp.source.session', amount: 10 }], at: 0 },
    awardInPlace: false,
  })
})

describe('captureRound', () => {
  it('takes the snapshot before the round is paid and recorded', () => {
    useAchievementStore.setState({ unlockedIds: ['first_hand'], unlocksInPlace: false })
    let seenAtFinish: { inPlace: boolean; unlocks: boolean } | null = null
    const capture = captureRound(() => {
      seenAtFinish = { inPlace: useLevelStore.getState().awardInPlace, unlocks: useAchievementStore.getState().unlocksInPlace }
      useAchievementStore.setState({ unlockedIds: ['first_hand', 'sharp_eye'] })
      useStatsStore.setState({ sessions: [{ ...old, id: 'new' }, old] })
    })
    expect(capture.awardSince).toBe(41)
    expect([...capture.sessionIds]).toEqual(['old'])
    // The toast is told before the payout, so it never draws the award for a frame.
    expect(seenAtFinish).toEqual({ inPlace: true, unlocks: true })
    // The awards unlocked by the round are the ones not in here.
    expect([...capture.unlockedBefore]).toEqual(['first_hand'])
  })

  it('records the plan stage the learner was on, or null without a plan', () => {
    expect(captureRound(() => {}).stage).toBeNull()
    localStorage.setItem('bjt_placement', 'hi-lo')
    expect(captureRound(() => {}).stage).toBe('hi-lo')
  })

  it('starts from zero when nothing was ever awarded', () => {
    useLevelStore.setState({ lastAward: null })
    expect(captureRound(() => {}).awardSince).toBe(0)
  })
})
