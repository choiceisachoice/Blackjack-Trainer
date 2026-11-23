import { describe, it, expect, beforeEach } from 'vitest'
import {
  GUEST_SINCE_KEY, GUEST_CLOCK_SLACK_MS,
  guestRoundSince, clearGuestRound, guestDataBelongsTo,
} from './guest-trial'

const T0 = Date.parse('2026-11-22T10:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

/**
 * A device on which the flashcard round was played before 23 Nov 2026: it
 * carries the stamp that round wrote. Nothing writes one any more (the guest
 * table records nothing), which is why the tests set it by hand — the merge
 * still has to read the ones that are out there.
 */
const playedBefore = (at: number) => localStorage.setItem(GUEST_SINCE_KEY, String(at))

beforeEach(() => localStorage.clear())

describe('the trial stamp', () => {
  it('is absent on a device where no trial round was played', () => {
    expect(guestRoundSince()).toBeNull()
  })

  it('reads the moment the old round began', () => {
    playedBefore(T0)
    expect(guestRoundSince()).toBe(T0)
  })

  it('can be forgotten', () => {
    playedBefore(T0)
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

describe('guestDataBelongsTo', () => {
  it('keeps the old rule when there is no trial data: ownerless data is handed over', () => {
    expect(guestDataBelongsTo(iso(T0 - 365 * 86_400_000))).toBe(true)
    expect(guestDataBelongsTo(undefined)).toBe(true)
  })

  it('hands a trial round to the account created after it', () => {
    playedBefore(T0)
    expect(guestDataBelongsTo(iso(T0 + 4 * 60_000))).toBe(true)
  })

  it('refuses an account that existed before the round was played', () => {
    playedBefore(T0)
    expect(guestDataBelongsTo(iso(T0 - 30 * 86_400_000))).toBe(false)
  })

  it('allows for a device clock that runs a little ahead, and no further', () => {
    playedBefore(T0)
    expect(guestDataBelongsTo(iso(T0 - GUEST_CLOCK_SLACK_MS + 1000))).toBe(true)
    expect(guestDataBelongsTo(iso(T0 - GUEST_CLOCK_SLACK_MS - 1000))).toBe(false)
  })

  it('refuses an account it cannot date', () => {
    playedBefore(T0)
    expect(guestDataBelongsTo(undefined)).toBe(false)
    expect(guestDataBelongsTo('not a date')).toBe(false)
  })
})
