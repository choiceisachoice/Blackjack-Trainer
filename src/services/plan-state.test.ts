import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  readPlanState,
  parsePlanState,
  mergePlanState,
  writePlanState,
  type PlanState,
} from './plan-state'
import { onPlanStateChanged, planStateUpdatedAt, planStateVersion } from './plan-state-signal'
import { getPlacement, setPlacement, getReadStages, markStageRead, hasSkippedPlacement, setPlacementSkipped } from './curriculum'
import { getProfile, setProfile, type LearnerProfile } from './learner-profile'
import { hasSeenWelcome, setWelcomeSeen } from './onboarding'
import {
  getStartLevel,
  setRecommendation,
  hasSeenTour,
  setTourSeen,
  isRecommendationDone,
  setRecommendationDone,
} from './recommendation'
import { hasSeenLevelIntro, markLevelIntroSeen } from './level-intro'
import { clearLocalAppData } from './storage/local-reset'

/** A device that has never been asked anything. */
const EMPTY: PlanState = {
  placement: null,
  skipped: false,
  readStages: [],
  profile: null,
  startLevel: null,
  welcomeSeen: false,
  tourSeen: false,
  recommendationDone: false,
  levelIntroSeen: false,
  updatedAt: 0,
}

const state = (over: Partial<PlanState> = {}): PlanState => ({ ...EMPTY, ...over })

const PROFILE_A: LearnerProfile = { goal: 'profit', commitment: 'regular', daysPerWeek: 4, minutesPerDay: 30 }
const PROFILE_B: LearnerProfile = { goal: 'curious', commitment: 'light', daysPerWeek: 1, minutesPerDay: 10 }

/** An account that answered everything and saw everything. */
const ANSWERED: PlanState = {
  placement: 'true-count',
  skipped: false,
  readStages: ['rules', 'basic-strategy'],
  profile: PROFILE_A,
  startLevel: 'counting',
  welcomeSeen: true,
  tourSeen: true,
  recommendationDone: true,
  levelIntroSeen: true,
  updatedAt: 1_700_000_000_000,
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('readPlanState', () => {
  it('reads "never asked" from an empty device', () => {
    expect(readPlanState()).toEqual(EMPTY)
  })

  it('collects every answer the modules hold', () => {
    setPlacement('true-count')
    setProfile(PROFILE_A)
    markStageRead('rules')
    setWelcomeSeen()
    setRecommendation('counting')
    setRecommendationDone()
    setTourSeen()
    markLevelIntroSeen()

    expect(readPlanState()).toEqual({
      placement: 'true-count',
      skipped: false,
      readStages: ['rules'],
      profile: PROFILE_A,
      startLevel: 'counting',
      welcomeSeen: true,
      tourSeen: true,
      recommendationDone: true,
      levelIntroSeen: true,
      updatedAt: planStateUpdatedAt(),
    })
    expect(readPlanState().updatedAt).toBeGreaterThan(0)
  })

  it('reports a declined question', () => {
    setPlacementSkipped()
    expect(readPlanState()).toMatchObject({ placement: null, skipped: true })
  })
})

describe('parsePlanState', () => {
  it('has nothing to say about a row that holds no plan', () => {
    for (const raw of [undefined, null, 'plan', 42, true]) {
      expect(parsePlanState(raw), String(raw)).toBeNull()
    }
  })

  it('reads back exactly what was written', () => {
    // The cloud copy is this object through JSON.
    expect(parsePlanState(JSON.parse(JSON.stringify(ANSWERED)))).toEqual(ANSWERED)
  })

  it('reads an empty object as an account that was never asked', () => {
    expect(parsePlanState({})).toEqual(EMPTY)
  })

  it('tolerates garbage in every field without throwing', () => {
    const garbage = {
      placement: 'not-a-stage',
      skipped: 'yes',
      readStages: 'rules',
      profile: 'serious',
      startLevel: 7,
      welcomeSeen: 1,
      tourSeen: 'true',
      recommendationDone: {},
      levelIntroSeen: [],
      updatedAt: 'yesterday',
    }
    expect(parsePlanState(garbage)).toEqual(EMPTY)
  })

  it('costs a bad field that field, never its neighbours', () => {
    const parsed = parsePlanState({ ...ANSWERED, placement: 'nonsense', unknownFromNewerBuild: { a: 1 } })
    expect(parsed).toEqual({ ...ANSWERED, placement: null })
  })

  it('keeps only real stages in the reading list', () => {
    expect(parsePlanState({ readStages: ['rules', 'nonsense', 3, null, 'hi-lo'] })?.readStages)
      .toEqual(['rules', 'hi-lo'])
  })

  it('accepts only a literal true for a flag', () => {
    for (const truthy of [1, 'true', 'yes', {}, []]) {
      const parsed = parsePlanState({ welcomeSeen: truthy, tourSeen: truthy, skipped: truthy })
      expect(parsed, String(truthy)).toMatchObject({ welcomeSeen: false, tourSeen: false, skipped: false })
    }
  })

  it('reads a stamp that is not a finite number as "never"', () => {
    for (const updatedAt of ['1700000000000', null, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(parsePlanState({ updatedAt })?.updatedAt, String(updatedAt)).toBe(0)
    }
  })

  describe('the profile', () => {
    it('needs a known goal and a known pace', () => {
      expect(parsePlanState({ profile: { goal: 'rich', commitment: 'regular' } })?.profile).toBeNull()
      expect(parsePlanState({ profile: { goal: 'profit', commitment: 'frantic' } })?.profile).toBeNull()
      expect(parsePlanState({ profile: { goal: 'profit' } })?.profile).toBeNull()
      expect(parsePlanState({ profile: null })?.profile).toBeNull()
      expect(parsePlanState({ profile: ['profit', 'regular'] })?.profile).toBeNull()
    })

    it('loads a profile from before the time question, without a budget', () => {
      expect(parsePlanState({ profile: { goal: 'profit', commitment: 'regular' } })?.profile)
        .toEqual({ goal: 'profit', commitment: 'regular' })
    })

    it('drops a budget the picker could not have produced and keeps the answers', () => {
      const parsed = parsePlanState({
        profile: { goal: 'profit', commitment: 'regular', daysPerWeek: 9, minutesPerDay: 45 },
      })
      expect(parsed?.profile).toEqual({ goal: 'profit', commitment: 'regular' })
    })

    it('ignores fields from an older, longer questionnaire', () => {
      const parsed = parsePlanState({
        profile: { goal: 'serious', commitment: 'heavy', casinoExperience: 'none', arithmetic: 'slow' },
      })
      expect(parsed?.profile).toEqual({ goal: 'serious', commitment: 'heavy' })
    })

    it('only ever yields a profile the local store reads back unchanged', () => {
      // What the merge writes to this device has to survive `getProfile`, or
      // the cloud and the device disagree about the same answer for ever.
      const candidates = [
        { goal: 'profit', commitment: 'regular', daysPerWeek: 4, minutesPerDay: 30 },
        { goal: 'profit', commitment: 'regular', daysPerWeek: 1, minutesPerDay: 60 },
        { goal: 'profit', commitment: 'regular', daysPerWeek: 7, minutesPerDay: 10 },
        { goal: 'profit', commitment: 'regular', daysPerWeek: 2.4, minutesPerDay: 20 },
        { goal: 'profit', commitment: 'regular', daysPerWeek: 6.6, minutesPerDay: 20 },
      ]
      for (const raw of candidates) {
        const parsed = parsePlanState({ profile: raw })!.profile!
        setProfile(parsed)
        expect(getProfile(), JSON.stringify(raw)).toEqual(parsed)
      }
    })
  })
})

describe('mergePlanState', () => {
  it('keeps this device as it is when the account holds no plan', () => {
    const local = state({ placement: 'hi-lo', profile: PROFILE_A, welcomeSeen: true, updatedAt: 5 })
    expect(mergePlanState(local, null)).toBe(local)
    expect(mergePlanState(EMPTY, null)).toEqual(EMPTY)
  })

  describe('the sign-in after a sign-out: an empty device meets an answered account', () => {
    it('takes every answer from the account', () => {
      expect(mergePlanState(EMPTY, ANSWERED)).toEqual(ANSWERED)
    })

    it('does so even when this device has the newer clock', () => {
      // An empty device can still carry a fresh stamp — the welcome screen was
      // tapped a second ago, before the merge landed. A side with no answer
      // never beats one that has one.
      const local = state({ welcomeSeen: true, updatedAt: ANSWERED.updatedAt + 60_000 })
      const merged = mergePlanState(local, ANSWERED)
      expect(merged.placement).toBe(ANSWERED.placement)
      expect(merged.profile).toEqual(ANSWERED.profile)
      expect(merged.startLevel).toBe(ANSWERED.startLevel)
      expect(merged.updatedAt).toBe(ANSWERED.updatedAt + 60_000)
    })

    it('does so even when this device declined the question a moment ago', () => {
      const local = state({ skipped: true, updatedAt: ANSWERED.updatedAt + 60_000 })
      const merged = mergePlanState(local, ANSWERED)
      expect(merged.placement).toBe(ANSWERED.placement)
      // Declining is undone by an answer, on either side.
      expect(merged.skipped).toBe(false)
    })
  })

  it('keeps this device’s answers when the account has a plan but no answers in it', () => {
    const local = state({ placement: 'hi-lo', profile: PROFILE_A, startLevel: 'strategy', updatedAt: 1 })
    const cloud = state({ welcomeSeen: true, updatedAt: 999 })
    const merged = mergePlanState(local, cloud)
    expect(merged).toMatchObject({ placement: 'hi-lo', profile: PROFILE_A, startLevel: 'strategy', welcomeSeen: true })
  })

  describe('both sides answered', () => {
    const local = state({ placement: 'hi-lo', profile: PROFILE_A, startLevel: 'strategy', updatedAt: 200 })
    const cloud = state({ placement: 'bet-spread', profile: PROFILE_B, startLevel: 'deviations', updatedAt: 100 })

    it('lets the newer side win', () => {
      expect(mergePlanState(local, cloud)).toMatchObject({
        placement: 'hi-lo', profile: PROFILE_A, startLevel: 'strategy',
      })
      expect(mergePlanState({ ...local, updatedAt: 50 }, cloud)).toMatchObject({
        placement: 'bet-spread', profile: PROFILE_B, startLevel: 'deviations',
      })
    })

    it('takes the winner’s answers as a unit, never a goal from one and a start from the other', () => {
      for (const localAt of [50, 100, 200]) {
        const merged = mergePlanState({ ...local, updatedAt: localAt }, cloud)
        const pair = [merged.placement, merged.profile, merged.startLevel]
        const fromLocal = [local.placement, local.profile, local.startLevel]
        const fromCloud = [cloud.placement, cloud.profile, cloud.startLevel]
        expect([fromLocal, fromCloud], `local at ${localAt}`).toContainEqual(pair)
      }
    })

    it('takes the winner whole even where the winner holds less', () => {
      // The newer side has a placement and no profile. The older side's
      // profile is not grafted onto it.
      const newer = state({ placement: 'hi-lo', profile: null, updatedAt: 300 })
      const merged = mergePlanState(newer, cloud)
      expect(merged.placement).toBe('hi-lo')
      expect(merged.profile).toBeNull()
      expect(merged.startLevel).toBeNull()
    })

    it('keeps this device on a tie', () => {
      expect(mergePlanState({ ...local, updatedAt: 100 }, cloud).placement).toBe('hi-lo')
    })

    it('carries the newer of the two stamps', () => {
      expect(mergePlanState(local, cloud).updatedAt).toBe(200)
      expect(mergePlanState({ ...local, updatedAt: 50 }, cloud).updatedAt).toBe(100)
    })
  })

  describe('things that only ever become true', () => {
    const flags = ['welcomeSeen', 'tourSeen', 'levelIntroSeen'] as const

    it('counts a greeting seen on either side as seen', () => {
      for (const flag of flags) {
        expect(mergePlanState(state({ [flag]: true }), state())[flag], `${flag} local`).toBe(true)
        expect(mergePlanState(state(), state({ [flag]: true }))[flag], `${flag} cloud`).toBe(true)
        expect(mergePlanState(state({ [flag]: true }), state({ [flag]: true }))[flag], `${flag} both`).toBe(true)
        expect(mergePlanState(state(), state())[flag], `${flag} neither`).toBe(false)
      }
    })

    it('does not let whoever wins the answers decide the flags', () => {
      // Cloud wins the answers; the tour was only ever seen here.
      const local = state({ placement: 'hi-lo', tourSeen: true, updatedAt: 1 })
      const cloud = state({ placement: 'table', welcomeSeen: true, updatedAt: 2 })
      const merged = mergePlanState(local, cloud)
      expect(merged.placement).toBe('table')
      expect(merged).toMatchObject({ tourSeen: true, welcomeSeen: true })
    })

    it('unions the reading list without repeats', () => {
      const merged = mergePlanState(
        state({ readStages: ['rules', 'hi-lo'] }),
        state({ readStages: ['hi-lo', 'basic-strategy'] }),
      )
      expect(merged.readStages).toHaveLength(3)
      expect(new Set(merged.readStages)).toEqual(new Set(['rules', 'hi-lo', 'basic-strategy']))
    })

    it('keeps a page read on the losing side', () => {
      const local = state({ placement: 'hi-lo', readStages: ['rules'], updatedAt: 1 })
      const cloud = state({ placement: 'table', readStages: [], updatedAt: 2 })
      expect(mergePlanState(local, cloud).readStages).toEqual(['rules'])
    })
  })

  describe('declining the question', () => {
    it('stays declined when either side declined and nobody answered', () => {
      expect(mergePlanState(state({ skipped: true }), state()).skipped).toBe(true)
      expect(mergePlanState(state(), state({ skipped: true })).skipped).toBe(true)
      expect(mergePlanState(state(), state()).skipped).toBe(false)
    })

    it('is undone by an answer on either side', () => {
      expect(mergePlanState(state({ placement: 'hi-lo' }), state({ skipped: true })).skipped).toBe(false)
      expect(mergePlanState(state({ skipped: true }), state({ placement: 'hi-lo' })).skipped).toBe(false)
    })
  })

  describe('the suggestion card', () => {
    it('follows this device when this device answered last — a new answer reopens it', () => {
      const local = state({ placement: 'hi-lo', recommendationDone: false, updatedAt: 2 })
      const cloud = state({ placement: 'rules', recommendationDone: true, updatedAt: 1 })
      expect(mergePlanState(local, cloud).recommendationDone).toBe(false)
    })

    it('stays put away once dismissed anywhere, when the account’s answers win', () => {
      const cloudWins = { placement: 'rules' as const, updatedAt: 2 }
      expect(mergePlanState(state({ recommendationDone: true }), state(cloudWins)).recommendationDone).toBe(true)
      expect(mergePlanState(state(), state({ ...cloudWins, recommendationDone: true })).recommendationDone).toBe(true)
      expect(mergePlanState(state(), state(cloudWins)).recommendationDone).toBe(false)
    })
  })

  it('changes neither argument', () => {
    const local = state({ placement: 'hi-lo', readStages: ['rules'], updatedAt: 1 })
    const cloud = { ...ANSWERED, readStages: [...ANSWERED.readStages] }
    const localBefore = JSON.stringify(local)
    const cloudBefore = JSON.stringify(cloud)
    mergePlanState(local, cloud)
    expect(JSON.stringify(local)).toBe(localBefore)
    expect(JSON.stringify(cloud)).toBe(cloudBefore)
  })

  it('is settled after one pass: merging the result with the account again changes nothing', () => {
    // Otherwise every page load would write a different plan back.
    const local = state({ placement: 'hi-lo', profile: PROFILE_B, readStages: ['rules'], tourSeen: true, updatedAt: 9 })
    const once = mergePlanState(local, ANSWERED)
    expect(mergePlanState(once, once)).toEqual(once)
    expect(mergePlanState(once, ANSWERED)).toEqual(once)
  })
})

describe('writePlanState', () => {
  it('puts a merged state onto an empty device, and it reads back the same', () => {
    writePlanState(ANSWERED)
    expect(readPlanState()).toEqual(ANSWERED)
    // Through each module's own reader, which is what the screens use.
    expect(getPlacement()).toBe('true-count')
    expect(getProfile()).toEqual(PROFILE_A)
    expect(getReadStages()).toEqual(['rules', 'basic-strategy'])
    expect(getStartLevel()).toBe('counting')
    expect(hasSeenWelcome()).toBe(true)
    expect(hasSeenTour()).toBe(true)
    expect(isRecommendationDone()).toBe(true)
    expect(hasSeenLevelIntro()).toBe(true)
  })

  it('does not stamp "now" on answers given last month', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-17T09:00:00.000Z'))
    writePlanState(ANSWERED)
    expect(planStateUpdatedAt()).toBe(ANSWERED.updatedAt)
    expect(planStateUpdatedAt()).not.toBe(Date.now())
  })

  it('leaves the stamp alone for a state nobody ever answered', () => {
    setWelcomeSeen()
    const stamped = planStateUpdatedAt()
    writePlanState(state({ welcomeSeen: true, updatedAt: 0 }))
    expect(planStateUpdatedAt()).toBe(stamped)
  })

  it('tells the screens once, as a change from the cloud', () => {
    const heard: string[] = []
    const stop = onPlanStateChanged(origin => heard.push(origin))
    const version = planStateVersion()
    writePlanState(ANSWERED)
    stop()
    // Eight setters ran; none of them may have counted as a tap, or the merge
    // would be pushed straight back and echo for ever.
    expect(heard).toEqual(['cloud'])
    expect(planStateVersion()).toBe(version + 1)
  })

  it('never unsets a flag that is already raised', () => {
    setWelcomeSeen()
    setTourSeen()
    markLevelIntroSeen()
    setRecommendationDone()
    setPlacementSkipped()

    writePlanState(state({ updatedAt: 5 }))

    expect(hasSeenWelcome()).toBe(true)
    expect(hasSeenTour()).toBe(true)
    expect(hasSeenLevelIntro()).toBe(true)
    expect(isRecommendationDone()).toBe(true)
    expect(hasSkippedPlacement()).toBe(true)
  })

  it('never un-places or un-profiles a device from a state that holds neither', () => {
    setPlacement('hi-lo')
    setProfile(PROFILE_A)
    setRecommendation('strategy')

    writePlanState(state({ welcomeSeen: true, updatedAt: 5 }))

    expect(getPlacement()).toBe('hi-lo')
    expect(getProfile()).toEqual(PROFILE_A)
    expect(getStartLevel()).toBe('strategy')
  })

  it('replaces the answers when the state carries others', () => {
    setPlacement('hi-lo')
    setProfile(PROFILE_A)
    setRecommendation('strategy')

    writePlanState(state({ placement: 'table', profile: PROFILE_B, startLevel: 'table', updatedAt: 5 }))

    expect(getPlacement()).toBe('table')
    expect(getProfile()).toEqual(PROFILE_B)
    expect(getStartLevel()).toBe('table')
  })

  it('does not reopen the suggestion card by restoring the level answer', () => {
    // `setRecommendation` reopens the card, which is right for a tap and wrong
    // for a merge.
    setRecommendationDone()
    writePlanState(state({ placement: 'hi-lo', startLevel: 'strategy', recommendationDone: true, updatedAt: 5 }))
    expect(getStartLevel()).toBe('strategy')
    expect(isRecommendationDone()).toBe(true)
  })

  it('marks the question declined when the merged state says so', () => {
    writePlanState(state({ skipped: true, updatedAt: 5 }))
    expect(hasSkippedPlacement()).toBe(true)
  })

  it('survives storage that refuses every write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    expect(() => writePlanState(ANSWERED)).not.toThrow()
  })
})

describe('the round trip a sign-out forces', () => {
  it('brings every answer back: read, wipe, merge with the account’s copy, write', () => {
    // 17 Nov 2026: signing out wiped these eight keys and nothing brought
    // them back, so the next sign-in asked "where are you starting from?".
    setWelcomeSeen()
    setPlacement('true-count')
    setProfile(PROFILE_A)
    setRecommendation('counting')
    markStageRead('rules')
    setTourSeen()
    markLevelIntroSeen()
    setRecommendationDone()
    const before = readPlanState()
    const inTheCloud: unknown = JSON.parse(JSON.stringify(before))

    clearLocalAppData()
    expect(readPlanState()).toEqual(EMPTY)

    const merged = mergePlanState(readPlanState(), parsePlanState(inTheCloud))
    writePlanState(merged)

    expect(readPlanState()).toEqual(before)
  })
})
