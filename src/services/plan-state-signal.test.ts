import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  onPlanStateChanged,
  planStateChanged,
  planStateHydrated,
  planStateUpdatedAt,
  planStateVersion,
  withoutRinging,
} from './plan-state-signal'
import {
  setPlacement,
  setPlacementSkipped,
  clearPlacementSkip,
  markStageRead,
  setReadStages,
} from './curriculum'
import { setProfile } from './learner-profile'
import { setWelcomeSeen, setOnboardingSeen } from './onboarding'
import { setRecommendation, setRecommendationDone, setTourSeen } from './recommendation'
import { markLevelIntroSeen } from './level-intro'
import { setClaimedStages } from './stage-rewards'

const UPDATED_KEY = 'bjt_plan_updated_at'

/** Listens for the length of one test. */
function listen() {
  const heard: string[] = []
  const stop = onPlanStateChanged(origin => heard.push(origin))
  return { heard, stop }
}

let stops: (() => void)[] = []
const hear = () => {
  const l = listen()
  stops.push(l.stop)
  return l.heard
}

beforeEach(() => {
  localStorage.clear()
  stops = []
})

afterEach(() => {
  stops.forEach(stop => stop())
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('planStateChanged', () => {
  it('tells every listener the change came from this device', () => {
    const a = hear()
    const b = hear()
    planStateChanged()
    expect(a).toEqual(['local'])
    expect(b).toEqual(['local'])
  })

  it('stamps the time of the answer', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-17T09:00:00.000Z'))
    expect(planStateUpdatedAt()).toBe(0)
    planStateChanged()
    expect(planStateUpdatedAt()).toBe(Date.parse('2026-11-17T09:00:00.000Z'))
  })

  it('counts every change, so a screen can tell "read again" from "nothing new"', () => {
    const before = planStateVersion()
    planStateChanged()
    planStateChanged()
    expect(planStateVersion()).toBe(before + 2)
  })

  it('still tells the listeners when the stamp cannot be stored', () => {
    const heard = hear()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    expect(() => planStateChanged()).not.toThrow()
    expect(heard).toEqual(['local'])
  })
})

describe('planStateHydrated', () => {
  it('tells listeners the change came from the cloud', () => {
    const heard = hear()
    planStateHydrated(1_700_000_000_000)
    expect(heard).toEqual(['cloud'])
  })

  it('carries the merged stamp instead of stamping now', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-17T09:00:00.000Z'))
    planStateHydrated(1_700_000_000_000)
    expect(planStateUpdatedAt()).toBe(1_700_000_000_000)
  })

  it('leaves the stamp alone when the merged state has never been answered', () => {
    localStorage.setItem(UPDATED_KEY, '42')
    planStateHydrated(0)
    expect(planStateUpdatedAt()).toBe(42)
  })

  it('bumps the version, so screens read again', () => {
    const before = planStateVersion()
    planStateHydrated(5)
    expect(planStateVersion()).toBe(before + 1)
  })
})

describe('planStateUpdatedAt', () => {
  it('is 0 when nothing was ever answered', () => {
    expect(planStateUpdatedAt()).toBe(0)
  })

  it('is 0 for a stamp that is not a positive number', () => {
    for (const bad of ['', 'yesterday', '-5', '0', 'NaN', 'Infinity']) {
      localStorage.setItem(UPDATED_KEY, bad)
      expect(planStateUpdatedAt(), bad).toBe(0)
    }
  })
})

describe('onPlanStateChanged', () => {
  it('stops telling a listener that has left', () => {
    const { heard, stop } = listen()
    planStateChanged()
    stop()
    planStateChanged()
    planStateHydrated(1)
    expect(heard).toEqual(['local'])
  })
})

describe('withoutRinging', () => {
  it('silences the bell: no listener, no stamp, no version', () => {
    const heard = hear()
    const before = planStateVersion()
    withoutRinging(() => {
      planStateChanged()
      planStateChanged()
    })
    expect(heard).toEqual([])
    expect(planStateUpdatedAt()).toBe(0)
    expect(planStateVersion()).toBe(before)
  })

  it('rings again afterwards', () => {
    const heard = hear()
    withoutRinging(() => planStateChanged())
    planStateChanged()
    expect(heard).toEqual(['local'])
  })

  it('rings again even when the silenced write threw', () => {
    const heard = hear()
    expect(() => withoutRinging(() => { throw new Error('boom') })).toThrow('boom')
    planStateChanged()
    expect(heard).toEqual(['local'])
  })
})

describe('every writer of a plan answer rings the bell', () => {
  // Each of these is a place the learner tells the plan something. One that
  // forgot to ring would leave the screen stale and the answer on this device
  // only — which is how a sign-out came to cost the placement.
  const writers: [string, () => void][] = [
    ['setPlacement', () => setPlacement('hi-lo')],
    ['setPlacementSkipped', () => setPlacementSkipped()],
    ['clearPlacementSkip', () => clearPlacementSkip()],
    ['markStageRead', () => markStageRead('rules')],
    ['setReadStages', () => setReadStages(['rules', 'hi-lo'])],
    ['setProfile', () => setProfile({ goal: 'profit', commitment: 'regular', daysPerWeek: 4, minutesPerDay: 30 })],
    ['setWelcomeSeen', () => setWelcomeSeen()],
    ['setRecommendation', () => setRecommendation('counting')],
    ['setRecommendationDone', () => setRecommendationDone()],
    ['setTourSeen', () => setTourSeen()],
    ['markLevelIntroSeen', () => markLevelIntroSeen()],
  ]

  for (const [name, write] of writers) {
    it(`${name} notifies with 'local' and stamps the time`, () => {
      const heard = hear()
      const version = planStateVersion()
      write()
      expect(heard).toEqual(['local'])
      expect(planStateVersion()).toBe(version + 1)
      expect(planStateUpdatedAt()).toBeGreaterThan(0)
    })

    it(`${name} is silent inside withoutRinging, and still writes`, () => {
      const heard = hear()
      const keysBefore = localStorage.length
      withoutRinging(write)
      expect(heard).toEqual([])
      expect(planStateUpdatedAt()).toBe(0)
      // clearPlacementSkip removes a key that is not there; everything else
      // must have left something behind.
      if (name !== 'clearPlacementSkip') expect(localStorage.length).toBeGreaterThan(keysBefore)
    })
  }

  it('does not ring for writes that are not plan answers', () => {
    // These travel by their own columns; ringing here would push the plan on
    // every XP award.
    const heard = hear()
    setOnboardingSeen(true)
    setClaimedStages(['hi-lo'])
    expect(heard).toEqual([])
    expect(planStateUpdatedAt()).toBe(0)
  })
})
