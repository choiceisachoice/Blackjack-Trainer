import { describe, it, expect, beforeEach } from 'vitest'
import {
  GUEST_SINCE_KEY, GUEST_CLOCK_SLACK_MS,
  guestRoundSince, markGuestRound, clearGuestRound, guestRoundIsKept, guestDataBelongsTo,
} from './guest-trial'
import { setLocalOwner } from './storage/local-owner'

const T0 = Date.parse('2026-11-22T10:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

beforeEach(() => localStorage.clear())

describe('the trial stamp', () => {
  it('is absent on a device where no trial round was played', () => {
    expect(guestRoundSince()).toBeNull()
  })

  it('records when the first round began and keeps the earliest', () => {
    markGuestRound(T0)
    markGuestRound(T0 + 86_400_000)
    expect(guestRoundSince()).toBe(T0)
  })

  it('can be forgotten', () => {
    markGuestRound(T0)
    clearGuestRound()
    expect(guestRoundSince()).toBeNull()
  })

  it('reads a damaged value as no stamp', () => {
    localStorage.setItem(GUEST_SINCE_KEY, 'yesterday')
    expect(guestRoundSince()).toBeNull()
  })

  it('lives under the app prefix, so the sign-out wipe takes it', () => {
    expect(GUEST_SINCE_KEY.startsWith('bjt_')).toBe(true)
  })
})

describe('guestRoundIsKept', () => {
  it('is true on a device that belongs to nobody', () => {
    expect(guestRoundIsKept()).toBe(true)
  })

  it('is false where an account’s data is still on the device', () => {
    setLocalOwner('user-1')
    expect(guestRoundIsKept()).toBe(false)
  })
})

describe('guestDataBelongsTo', () => {
  it('keeps the old rule when there is no trial data: ownerless data is handed over', () => {
    expect(guestDataBelongsTo(iso(T0 - 365 * 86_400_000))).toBe(true)
    expect(guestDataBelongsTo(undefined)).toBe(true)
  })

  it('hands a trial round to the account created after it', () => {
    markGuestRound(T0)
    expect(guestDataBelongsTo(iso(T0 + 4 * 60_000))).toBe(true)
  })

  it('refuses an account that existed before the round was played', () => {
    markGuestRound(T0)
    expect(guestDataBelongsTo(iso(T0 - 30 * 86_400_000))).toBe(false)
  })

  it('allows for a device clock that runs a little ahead, and no further', () => {
    markGuestRound(T0)
    expect(guestDataBelongsTo(iso(T0 - GUEST_CLOCK_SLACK_MS + 1000))).toBe(true)
    expect(guestDataBelongsTo(iso(T0 - GUEST_CLOCK_SLACK_MS - 1000))).toBe(false)
  })

  it('refuses an account it cannot date', () => {
    markGuestRound(T0)
    expect(guestDataBelongsTo(undefined)).toBe(false)
    expect(guestDataBelongsTo('not a date')).toBe(false)
  })
})
