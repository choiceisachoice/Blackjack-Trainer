import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  TRIAL_HANDS,
  TRIAL_KEY,
  countTrialHand,
  onTrialChanged,
  readTrialHandsUsed,
  setTrialHandsUsed,
  toTrialHands,
  trialHandsLeft,
  trialHandsUsed,
} from './casino-trial'

beforeEach(() => {
  localStorage.clear()
})

describe('the trial count on this device', () => {
  it('is unknown, not zero, until something has written it', () => {
    expect(readTrialHandsUsed()).toBeNull()
    // The sync merges by max and needs a number.
    expect(trialHandsUsed()).toBe(0)
  })

  it('a written zero is known', () => {
    setTrialHandsUsed(0)
    expect(readTrialHandsUsed()).toBe(0)
  })

  it('counts a settled hand', () => {
    setTrialHandsUsed(0)
    expect(countTrialHand()).toBe(1)
    expect(countTrialHand()).toBe(2)
    expect(readTrialHandsUsed()).toBe(2)
  })

  it('never goes down: a smaller number from elsewhere changes nothing', () => {
    setTrialHandsUsed(7)
    setTrialHandsUsed(3)
    expect(readTrialHandsUsed()).toBe(7)
    setTrialHandsUsed(0)
    expect(readTrialHandsUsed()).toBe(7)
  })

  it('stops at the limit', () => {
    setTrialHandsUsed(TRIAL_HANDS)
    expect(countTrialHand()).toBe(TRIAL_HANDS)
    setTrialHandsUsed(9_999)
    expect(readTrialHandsUsed()).toBe(TRIAL_HANDS)
  })

  it('reads a damaged record as unknown', () => {
    localStorage.setItem(TRIAL_KEY, '{nope')
    expect(readTrialHandsUsed()).toBeNull()
    localStorage.setItem(TRIAL_KEY, JSON.stringify({ used: 'ten' }))
    expect(readTrialHandsUsed()).toBeNull()
    localStorage.setItem(TRIAL_KEY, 'null')
    expect(readTrialHandsUsed()).toBeNull()
  })

  it('is under the prefix the sign-out wipe clears', () => {
    expect(TRIAL_KEY.startsWith('bjt_')).toBe(true)
  })
})

describe('toTrialHands', () => {
  it('turns whatever arrived into a whole count between zero and the limit', () => {
    expect(toTrialHands(4)).toBe(4)
    expect(toTrialHands(4.9)).toBe(4)
    expect(toTrialHands(-3)).toBe(0)
    expect(toTrialHands(1e9)).toBe(TRIAL_HANDS)
    expect(toTrialHands('7')).toBe(0)
    expect(toTrialHands(undefined)).toBe(0)
    expect(toTrialHands(Number.NaN)).toBe(0)
  })
})

describe('trialHandsLeft', () => {
  it('is what remains of ten', () => {
    expect(trialHandsLeft(0)).toBe(TRIAL_HANDS)
    expect(trialHandsLeft(3)).toBe(7)
    expect(trialHandsLeft(TRIAL_HANDS)).toBe(0)
    expect(trialHandsLeft(40)).toBe(0)
  })
})

describe('onTrialChanged', () => {
  it('tells a listener about every write, until it stops listening', () => {
    const listener = vi.fn()
    const stop = onTrialChanged(listener)
    setTrialHandsUsed(1)
    countTrialHand()
    expect(listener).toHaveBeenCalledTimes(2)
    stop()
    countTrialHand()
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
