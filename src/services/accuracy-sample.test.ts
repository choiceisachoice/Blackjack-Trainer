import { describe, it, expect } from 'vitest'
import { minAnswersFor, provesAccuracy } from './accuracy-sample'

describe('provesAccuracy', () => {
  it('does not take three answers for a result', () => {
    expect(provesAccuracy({ mode: 'deviationFlashCards', totalQuestions: 3 })).toBe(false)
    expect(provesAccuracy({ mode: 'betSpread', totalQuestions: 9 })).toBe(false)
    expect(provesAccuracy({ mode: 'deckEstimation', totalQuestions: 10 })).toBe(true)
  })

  it('accepts a full run of the shortest length every drill offers', () => {
    // The setup screens offer 10 as their smallest session.
    for (const mode of ['deviationFlashCards', 'betSpread', 'deckEstimation'] as const) {
      expect(provesAccuracy({ mode, totalQuestions: 10 }), mode).toBe(true)
    }
  })

  it('keeps the Speed Drill at the save minimum — one answer is a whole shoe', () => {
    expect(minAnswersFor('speedDrill')).toBe(3)
    expect(provesAccuracy({ mode: 'speedDrill', totalQuestions: 3 })).toBe(true)
    expect(provesAccuracy({ mode: 'speedDrill', totalQuestions: 2 })).toBe(false)
  })

  it('leaves casino sessions to their own minimums', () => {
    expect(provesAccuracy({ mode: 'casinoSession', totalQuestions: 1 })).toBe(true)
  })
})
