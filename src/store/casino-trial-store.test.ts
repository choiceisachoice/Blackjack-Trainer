import { describe, it, expect, beforeEach, vi } from 'vitest'

const pushProfileScalars = vi.fn()
vi.mock('../services/supabase/profiles-sync', () => ({
  pushProfileScalars: () => pushProfileScalars(),
}))

import { useCasinoTrialStore, selectTrialLeft, selectTrialOpen } from './casino-trial-store'
import { TRIAL_HANDS, TRIAL_KEY, setTrialHandsUsed } from '../services/casino-trial'

beforeEach(() => {
  localStorage.clear()
  pushProfileScalars.mockClear()
  useCasinoTrialStore.getState().refresh()
  useCasinoTrialStore.getState().setSeated(false)
})

describe('casino-trial-store', () => {
  it('offers nothing while the count is unknown on this device', () => {
    const state = useCasinoTrialStore.getState()
    expect(state.known).toBe(false)
    expect(selectTrialLeft(state)).toBe(0)
    expect(selectTrialOpen(state)).toBe(false)
  })

  it('follows a merge that lands from the cloud', () => {
    setTrialHandsUsed(4)
    const state = useCasinoTrialStore.getState()
    expect(state.known).toBe(true)
    expect(state.used).toBe(4)
    expect(selectTrialLeft(state)).toBe(TRIAL_HANDS - 4)
    expect(selectTrialOpen(state)).toBe(true)
  })

  it('counts a settled hand and sends it to the account', () => {
    setTrialHandsUsed(0)
    useCasinoTrialStore.getState().countHand()
    expect(useCasinoTrialStore.getState().used).toBe(1)
    expect(pushProfileScalars).toHaveBeenCalledTimes(1)
  })

  it('is closed after the tenth hand', () => {
    setTrialHandsUsed(TRIAL_HANDS - 1)
    useCasinoTrialStore.getState().countHand()
    const state = useCasinoTrialStore.getState()
    expect(selectTrialLeft(state)).toBe(0)
    expect(selectTrialOpen(state)).toBe(false)
  })

  it('goes back to unknown when the device was wiped', () => {
    setTrialHandsUsed(6)
    localStorage.removeItem(TRIAL_KEY)
    useCasinoTrialStore.getState().refresh()
    const state = useCasinoTrialStore.getState()
    expect(state.known).toBe(false)
    expect(selectTrialOpen(state)).toBe(false)
  })

  it('remembers that a trial table is on screen', () => {
    useCasinoTrialStore.getState().setSeated(true)
    expect(useCasinoTrialStore.getState().seated).toBe(true)
    useCasinoTrialStore.getState().setSeated(false)
    expect(useCasinoTrialStore.getState().seated).toBe(false)
  })
})
