import { describe, it, expect, beforeEach } from 'vitest'
import i18next from 'i18next'
import {
  firstMoveFor,
  recommendationHeadline,
  recommendationReason,
  setRecommendation,
  getStartLevel,
  isRecommendationDone,
  setRecommendationDone,
  hasSeenTour,
  setTourSeen,
  RECOMMENDATION_KEYS,
} from './recommendation'
import { CURRICULUM } from './curriculum'
import { ENTRY_OPTIONS } from './starting-point'

beforeEach(() => localStorage.clear())

describe('choosing the first move', () => {
  it('sends the complete beginner to read, because they have nothing to drill', () => {
    const move = firstMoveFor('rules', i18next.t)
    expect(move.kind).toBe('read')
    expect(move.mode).toBe('learn')
  })

  it('sends every other stage to that stage’s own drill', () => {
    for (const stage of CURRICULUM.slice(1)) {
      const move = firstMoveFor(stage.id, i18next.t)
      expect(move.kind).toBe('drill')
      // The suggestion has to open the screen the stage is actually measured
      // on — pointing somewhere else would advertise progress it cannot make.
      expect(move.mode).toBe(stage.drill?.mode)
    }
  })

  it('produces a move for every answer the question offers', () => {
    for (const option of ENTRY_OPTIONS) {
      const move = firstMoveFor(option.stage, i18next.t)
      expect(move.action.length).toBeGreaterThan(0)
      expect(move.detail.length).toBeGreaterThan(0)
      expect(move.stage).toBe(option.stage)
    }
  })

  it('falls back to reading for a stage that is not in the curriculum', () => {
    // A placement stored by an older build must not blank the card.
    const move = firstMoveFor('from-an-older-build' as never, i18next.t)
    expect(move.kind).toBe('read')
    expect(move.mode).toBe('learn')
  })
})

describe('the wording', () => {
  it('tells the beginner to read rather than drill', () => {
    expect(recommendationHeadline('rules', i18next.t)).toMatch(/read/i)
    expect(recommendationReason('rules', i18next.t)).toMatch(/never played/i)
  })

  it('credits the stages an experienced learner skipped', () => {
    expect(recommendationReason('hi-lo', i18next.t)).toMatch(/2 stages are already behind you/i)
  })

  it('says "stage" in the singular when exactly one was skipped', () => {
    // Off-by-one plurals are the tell that copy was written for one case only.
    expect(recommendationReason('basic-strategy', i18next.t)).toMatch(/The first stage is already behind you/i)
    expect(recommendationReason('basic-strategy', i18next.t)).not.toMatch(/1 stages/)
  })

  it('gives every stage a non-empty headline and reason', () => {
    for (const stage of CURRICULUM) {
      expect(recommendationHeadline(stage.id, i18next.t).length).toBeGreaterThan(0)
      expect(recommendationReason(stage.id, i18next.t).length).toBeGreaterThan(0)
    }
  })
})

describe('remembering', () => {
  it('stores the level that was picked', () => {
    setRecommendation('counting')
    expect(getStartLevel()).toBe('counting')
  })

  it('starts undismissed and stays dismissed once put away', () => {
    setRecommendation('new')
    expect(isRecommendationDone()).toBe(false)
    setRecommendationDone()
    expect(isRecommendationDone()).toBe(true)
  })

  it('re-opens the card when the question is answered again', () => {
    setRecommendation('new')
    setRecommendationDone()
    expect(isRecommendationDone()).toBe(true)

    // Retaking the question is a request to be pointed somewhere again.
    setRecommendation('strategy')
    expect(isRecommendationDone()).toBe(false)
    expect(getStartLevel()).toBe('strategy')
  })

  it('remembers the tour separately from the card', () => {
    expect(hasSeenTour()).toBe(false)
    setTourSeen()
    expect(hasSeenTour()).toBe(true)
    // Answering the question again must not replay a tour someone sat through.
    setRecommendation('rules')
    expect(hasSeenTour()).toBe(true)
  })

  it('returns null for a level that was never stored', () => {
    expect(getStartLevel()).toBeNull()
  })
})

describe('the storage keys', () => {
  it('all carry the app prefix, so a local reset wipes them', () => {
    // clearLocalAppData() drops every `bjt_*` key that is not a device
    // preference. That is the only thing keeping these from surviving a
    // sign-out into the next person's session, so it is asserted here rather
    // than assumed from the naming.
    for (const key of RECOMMENDATION_KEYS) {
      expect(key.startsWith('bjt_')).toBe(true)
    }
  })

  it('does not collide with the device preferences a reset deliberately keeps', () => {
    const kept = ['bjt_sound_settings', 'bjt_dealing_speed', 'bjt_ambient_volume']
    for (const key of RECOMMENDATION_KEYS) {
      expect(kept).not.toContain(key)
    }
  })
})
