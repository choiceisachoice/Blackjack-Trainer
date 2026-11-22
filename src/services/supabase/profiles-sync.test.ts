import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// A minimal supabase-js shape: the sync reads with
// `from().select().eq().maybeSingle()` and writes with
// `from().update().eq().select()`. Every leaf is a spy so a test can decide
// what the cloud holds and see exactly what was written.
const maybeSingle = vi.fn()
const selectEq = vi.fn(() => ({ maybeSingle }))
const select = vi.fn(() => ({ eq: selectEq }))
const writeSelect = vi.fn()
const updateEq = vi.fn(() => ({ select: writeSelect }))
const update = vi.fn(() => ({ eq: updateEq }))
const upsert = vi.fn()
const from = vi.fn(() => ({ select, update, upsert }))
const getSession = vi.fn()

vi.mock('./client', () => ({
  requireSupabase: () => ({ from, auth: { getSession } }),
  isSupabaseConfigured: true,
}))

import { syncProfileOnSignIn, pushProfileScalars, pushProfileScalarsNow, resetProfileSync } from './profiles-sync'
import { levelSystem } from '../level-system'
import { getClaimedStages, setClaimedStages } from '../stage-rewards'
import { getClaimedRewards, setClaimedRewards } from '../weekly-rewards'
import { readPlanState, type PlanState } from '../plan-state'
import { onPlanStateChanged, planStateUpdatedAt } from '../plan-state-signal'
import { getPlacement, setPlacement, markStageRead, getReadStages } from '../curriculum'
import { getProfile, setProfile } from '../learner-profile'
import { hasSeenWelcome, setWelcomeSeen } from '../onboarding'
import { hasSeenTour } from '../recommendation'
import { readTrialHandsUsed, setTrialHandsUsed } from '../casino-trial'

const cloudRow = (overrides: Record<string, unknown> = {}) => ({
  level_xp: 0,
  sim_count: 0,
  sim_best_edge: 0,
  onboarding_seen: false,
  settings: {},
  ...overrides,
})

/** The object handed to `update()` on the most recent write. */
const lastWrite = () => (update.mock.calls.at(-1) as unknown as [Record<string, unknown>])[0]

/** The `settings` jsonb of the most recent write. */
const lastSettings = () => lastWrite().settings as Record<string, unknown>

/** The plan as the most recent write carried it. */
const lastPlan = () => lastSettings().plan as PlanState

/** What an account that answered everything holds in `settings.plan`. */
const CLOUD_PLAN: PlanState = {
  placement: 'true-count',
  skipped: false,
  readStages: ['rules'],
  profile: { goal: 'profit', commitment: 'regular', daysPerWeek: 4, minutesPerDay: 30 },
  startLevel: 'counting',
  welcomeSeen: true,
  tourSeen: true,
  recommendationDone: true,
  levelIntroSeen: true,
  updatedAt: 1_700_000_000_000,
}

/** Let the fire-and-forget push run to its end. */
const settled = async (writes: number) => {
  // One fake millisecond per look, so waiting never reaches the 400ms pause
  // after which an answer written in the test would be pushed by itself.
  await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(writes), { interval: 1 })
  await vi.waitFor(() => expect(writeSelect).toHaveBeenCalledTimes(writes), { interval: 1 })
}

describe('profiles-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    levelSystem.reload()
    // "Merged on this page load" is module state: every test starts as a
    // fresh page.
    resetProfileSync()
    // An answer written in a test starts the debounced push. On real timers
    // it would fire 400ms later, inside whichever test happened to be running
    // by then; on fake ones it fires only where a test advances the clock,
    // and whatever is still pending is dropped in `afterEach`.
    vi.useFakeTimers()
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    maybeSingle.mockResolvedValue({ data: cloudRow(), error: null })
    writeSelect.mockResolvedValue({ data: [{ id: 'u1' }], error: null })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('writes the row with update, never upsert', async () => {
    // The row is created by the signup trigger and the client has no INSERT
    // policy; an upsert is refused before Postgres looks at the conflict.
    // That refusal is how six weeks of progress went missing.
    levelSystem.setTotalXP(1200)
    await syncProfileOnSignIn()
    expect(upsert).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledTimes(1)
    expect(updateEq).toHaveBeenCalledWith('id', 'u1')
    expect(lastWrite()).toMatchObject({ level_xp: 1200 })
    expect(lastWrite()).not.toHaveProperty('id')
  })

  it('reconciles by max: a device with less does not lower the cloud', async () => {
    maybeSingle.mockResolvedValue({ data: cloudRow({ level_xp: 68000 }), error: null })
    levelSystem.setTotalXP(200)
    await syncProfileOnSignIn()
    expect(levelSystem.getTotalXP()).toBe(68000)
    expect(lastWrite()).toMatchObject({ level_xp: 68000 })
  })

  it('reconciles by max the other way: local progress reaches the cloud', async () => {
    maybeSingle.mockResolvedValue({ data: cloudRow({ level_xp: 0 }), error: null })
    levelSystem.setTotalXP(68000)
    await syncProfileOnSignIn()
    expect(lastWrite()).toMatchObject({ level_xp: 68000 })
  })

  it('unions the claimed stages and carries unknown settings keys through', async () => {
    maybeSingle.mockResolvedValue({
      data: cloudRow({ settings: { claimed_stages: ['rules'], theme: 'felt' } }),
      error: null,
    })
    setClaimedStages(['hi-lo'])
    await syncProfileOnSignIn()
    expect(new Set(getClaimedStages())).toEqual(new Set(['rules', 'hi-lo']))
    const settings = lastWrite().settings as { claimed_stages: string[]; theme: string }
    expect(settings.theme).toBe('felt')
    expect(new Set(settings.claimed_stages)).toEqual(new Set(['rules', 'hi-lo']))
  })

  it('unions the paid weeks the same way, and writes them back under their own key', async () => {
    maybeSingle.mockResolvedValue({
      data: cloudRow({ settings: {
        claimed_stages: ['rules'],
        claimed_rewards: ['week:2026-11-09', 'weekstreak:2026-11-02:2', 'not-a-reward', 7],
        theme: 'felt',
      } }),
      error: null,
    })
    setClaimedRewards(['week:2026-11-16', 'week:2026-11-09'])
    await syncProfileOnSignIn()
    const expected = new Set(['week:2026-11-09', 'week:2026-11-16', 'weekstreak:2026-11-02:2'])
    // On the device: what either side had, and nothing that is not a reward.
    expect(new Set(getClaimedRewards())).toEqual(expected)
    const settings = lastWrite().settings as { claimed_rewards: string[]; claimed_stages: string[]; theme: string }
    expect(new Set(settings.claimed_rewards)).toEqual(expected)
    // And the keys beside it are still there.
    expect(settings.claimed_stages).toEqual(['rules'])
    expect(settings.theme).toBe('felt')
  })

  it('an empty device takes no paid week away from the account', async () => {
    // The minute after a sign-in: nothing local, everything in the cloud. A
    // week that vanished here would be paid a second time.
    maybeSingle.mockResolvedValue({
      data: cloudRow({ settings: { claimed_rewards: ['week:2026-11-09', 'week:2026-11-16'] } }),
      error: null,
    })
    expect(getClaimedRewards()).toEqual([])
    await syncProfileOnSignIn()
    expect(getClaimedRewards()).toEqual(['week:2026-11-09', 'week:2026-11-16'])
    expect((lastWrite().settings as { claimed_rewards: string[] }).claimed_rewards)
      .toEqual(['week:2026-11-09', 'week:2026-11-16'])
  })

  it('an account that never had the key gets it from the device', async () => {
    maybeSingle.mockResolvedValue({ data: cloudRow({ settings: { theme: 'felt' } }), error: null })
    setClaimedRewards(['week:2026-11-16'])
    await syncProfileOnSignIn()
    expect((lastWrite().settings as { claimed_rewards: string[] }).claimed_rewards).toEqual(['week:2026-11-16'])
  })

  it('treats a write that matched no row as a failure', async () => {
    writeSelect.mockResolvedValue({ data: [], error: null })
    await expect(syncProfileOnSignIn()).rejects.toThrow(/row not found/)
  })

  it('surfaces a refused write instead of swallowing it', async () => {
    writeSelect.mockResolvedValue({ data: null, error: new Error('permission denied') })
    await expect(syncProfileOnSignIn()).rejects.toThrow('permission denied')
  })

  it('still restores the local copy when the write back fails', async () => {
    // The order matters: local is hydrated from the merge before the cloud is
    // written, so a refused write costs the cloud a push, not the device its
    // level.
    maybeSingle.mockResolvedValue({ data: cloudRow({ level_xp: 5000 }), error: null })
    writeSelect.mockResolvedValue({ data: null, error: new Error('permission denied') })
    await expect(syncProfileOnSignIn()).rejects.toThrow()
    expect(levelSystem.getTotalXP()).toBe(5000)
  })

  it('pushProfileScalars writes the local values with update', async () => {
    levelSystem.setTotalXP(450)
    pushProfileScalars()
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(upsert).not.toHaveBeenCalled()
    expect(lastWrite()).toMatchObject({ level_xp: 450 })
  })

  describe('the plan answers travel in settings.plan', () => {
    it('reads the account\u2019s plan from settings.plan and puts it on an empty device', async () => {
      // 17 Nov 2026 — the sign-in after a sign-out. The wipe took the eight
      // local keys; this is what brings them back.
      maybeSingle.mockResolvedValue({ data: cloudRow({ settings: { plan: CLOUD_PLAN } }), error: null })

      await syncProfileOnSignIn()

      expect(readPlanState()).toEqual(CLOUD_PLAN)
      expect(getPlacement()).toBe('true-count')
      expect(getProfile()).toEqual(CLOUD_PLAN.profile)
      expect(getReadStages()).toEqual(['rules'])
      expect(hasSeenWelcome()).toBe(true)
      expect(hasSeenTour()).toBe(true)
    })

    it('writes the merged plan back under settings.plan', async () => {
      maybeSingle.mockResolvedValue({ data: cloudRow({ settings: { plan: CLOUD_PLAN } }), error: null })
      await syncProfileOnSignIn()
      expect(update).toHaveBeenCalledTimes(1)
      expect(lastPlan()).toEqual(CLOUD_PLAN)
    })

    it('tells the screens the answers changed, as coming from the cloud', async () => {
      maybeSingle.mockResolvedValue({ data: cloudRow({ settings: { plan: CLOUD_PLAN } }), error: null })
      const heard: string[] = []
      const stop = onPlanStateChanged(origin => heard.push(origin))
      await syncProfileOnSignIn()
      stop()
      expect(heard).toEqual(['cloud'])
    })

    it('does not stamp the account\u2019s old answers as given just now', async () => {
      maybeSingle.mockResolvedValue({ data: cloudRow({ settings: { plan: CLOUD_PLAN } }), error: null })
      await syncProfileOnSignIn()
      expect(planStateUpdatedAt()).toBe(CLOUD_PLAN.updatedAt)
      expect(lastPlan().updatedAt).toBe(CLOUD_PLAN.updatedAt)
    })

    it('takes the account\u2019s answers even when this empty device has the newer clock', async () => {
      // The welcome screen was tapped a second ago, before the merge landed.
      setWelcomeSeen()
      expect(planStateUpdatedAt()).toBeGreaterThan(CLOUD_PLAN.updatedAt)
      maybeSingle.mockResolvedValue({ data: cloudRow({ settings: { plan: CLOUD_PLAN } }), error: null })

      await syncProfileOnSignIn()

      expect(getPlacement()).toBe('true-count')
      expect(getProfile()).toEqual(CLOUD_PLAN.profile)
      expect(lastPlan()).toMatchObject({ placement: 'true-count', profile: CLOUD_PLAN.profile })
    })

    it('carries a first answer up to an account that holds no plan yet', async () => {
      setPlacement('hi-lo')
      setProfile({ goal: 'serious', commitment: 'casual', daysPerWeek: 3, minutesPerDay: 20 })
      markStageRead('rules')

      await syncProfileOnSignIn()

      expect(lastPlan()).toMatchObject({
        placement: 'hi-lo',
        profile: { goal: 'serious', commitment: 'casual', daysPerWeek: 3, minutesPerDay: 20 },
        readStages: ['rules'],
      })
      expect(lastPlan().updatedAt).toBe(planStateUpdatedAt())
      // And this device keeps what it had.
      expect(getPlacement()).toBe('hi-lo')
    })

    it('lets the newer answers win as a unit when both sides have some', async () => {
      // Answered here just now; the account's copy is from last year.
      setPlacement('hi-lo')
      setProfile({ goal: 'curious', commitment: 'light', daysPerWeek: 1, minutesPerDay: 10 })
      maybeSingle.mockResolvedValue({ data: cloudRow({ settings: { plan: CLOUD_PLAN } }), error: null })

      await syncProfileOnSignIn()

      expect(lastPlan()).toMatchObject({
        placement: 'hi-lo',
        profile: { goal: 'curious', commitment: 'light', daysPerWeek: 1, minutesPerDay: 10 },
      })
      expect(getPlacement()).toBe('hi-lo')
      expect(getProfile()?.goal).toBe('curious')
    })

    it('lets the account win when its answers are the newer ones', async () => {
      setPlacement('hi-lo')
      setProfile({ goal: 'curious', commitment: 'light', daysPerWeek: 1, minutesPerDay: 10 })
      const newer = { ...CLOUD_PLAN, updatedAt: Date.now() + 60_000 }
      maybeSingle.mockResolvedValue({ data: cloudRow({ settings: { plan: newer } }), error: null })

      await syncProfileOnSignIn()

      expect(getPlacement()).toBe('true-count')
      expect(getProfile()).toEqual(CLOUD_PLAN.profile)
      expect(lastPlan()).toMatchObject({ placement: 'true-count', profile: CLOUD_PLAN.profile })
    })

    it('unions the reading list and ORs the greetings, whoever wins the answers', async () => {
      setPlacement('hi-lo')
      markStageRead('basic-strategy')
      const cloud = { ...CLOUD_PLAN, readStages: ['rules'], welcomeSeen: true, updatedAt: 1 }
      maybeSingle.mockResolvedValue({ data: cloudRow({ settings: { plan: cloud } }), error: null })

      await syncProfileOnSignIn()

      expect(new Set(getReadStages())).toEqual(new Set(['rules', 'basic-strategy']))
      expect(new Set(lastPlan().readStages)).toEqual(new Set(['rules', 'basic-strategy']))
      expect(hasSeenWelcome()).toBe(true)
      expect(lastPlan().welcomeSeen).toBe(true)
    })

    it('survives garbage where the plan should be', async () => {
      for (const plan of ['yes', 7, null, [], { placement: 'nonsense', profile: 'serious', readStages: 'rules' }]) {
        vi.clearAllMocks()
        localStorage.clear()
        resetProfileSync()
        getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
        writeSelect.mockResolvedValue({ data: [{ id: 'u1' }], error: null })
        maybeSingle.mockResolvedValue({ data: cloudRow({ level_xp: 900, settings: { plan } }), error: null })
        levelSystem.reload()

        // A field this build cannot read costs that field, never the sign-in.
        await expect(syncProfileOnSignIn(), JSON.stringify(plan)).resolves.toBeUndefined()
        expect(levelSystem.getTotalXP(), JSON.stringify(plan)).toBe(900)
        expect(getPlacement(), JSON.stringify(plan)).toBeNull()
      }
    })

    it('keeps every other key in settings when it writes the plan', async () => {
      // `settings` is one jsonb value: writing a fresh object would drop
      // whatever this build does not know about.
      maybeSingle.mockResolvedValue({
        data: cloudRow({ settings: { plan: CLOUD_PLAN, claimed_stages: ['rules'], theme: 'felt', nested: { a: [1, 2] } } }),
        error: null,
      })
      setClaimedStages(['hi-lo'])

      await syncProfileOnSignIn()

      const settings = lastSettings()
      expect(settings.theme).toBe('felt')
      expect(settings.nested).toEqual({ a: [1, 2] })
      expect(new Set(settings.claimed_stages as string[])).toEqual(new Set(['rules', 'hi-lo']))
      expect(settings.plan).toEqual(CLOUD_PLAN)
    })

    it('keeps those other keys on the later plain pushes too', async () => {
      maybeSingle.mockResolvedValue({
        data: cloudRow({ settings: { plan: CLOUD_PLAN, claimed_stages: ['rules'], theme: 'felt' } }),
        error: null,
      })
      await syncProfileOnSignIn()

      setPlacement('deviations')
      pushProfileScalars()
      await settled(2)

      const settings = lastSettings()
      expect(settings.theme).toBe('felt')
      expect(settings.claimed_stages).toEqual(['rules'])
      expect((settings.plan as PlanState).placement).toBe('deviations')
    })

    it('still puts the account\u2019s plan on the device when the write back fails', async () => {
      maybeSingle.mockResolvedValue({ data: cloudRow({ settings: { plan: CLOUD_PLAN } }), error: null })
      writeSelect.mockResolvedValue({ data: null, error: new Error('permission denied') })

      await expect(syncProfileOnSignIn()).rejects.toThrow('permission denied')

      expect(getPlacement()).toBe('true-count')
      expect(getProfile()).toEqual(CLOUD_PLAN.profile)
    })
  })

  describe('a push before the first merge on a page load', () => {
    it('merges instead of overwriting: it reads the row first', async () => {
      // The minute after a sign-in the device holds nothing. `settings` has no
      // database trigger protecting it, so a blind write here would replace
      // the account's plan and its paid stages with an empty set.
      maybeSingle.mockResolvedValue({
        data: cloudRow({ level_xp: 68000, settings: { plan: CLOUD_PLAN, claimed_stages: ['rules', 'hi-lo'] } }),
        error: null,
      })

      pushProfileScalars()
      await settled(1)

      // A fetch happened, and before the write.
      expect(maybeSingle).toHaveBeenCalledTimes(1)
      expect(maybeSingle.mock.invocationCallOrder[0]).toBeLessThan(update.mock.invocationCallOrder[0])
      // What was written is the merge, not this device's nothing.
      expect(lastWrite()).toMatchObject({ level_xp: 68000 })
      expect(lastPlan()).toEqual(CLOUD_PLAN)
      expect(new Set(lastSettings().claimed_stages as string[])).toEqual(new Set(['rules', 'hi-lo']))
      // And the device has it too.
      expect(getPlacement()).toBe('true-count')
      expect(new Set(getClaimedStages())).toEqual(new Set(['rules', 'hi-lo']))
      expect(levelSystem.getTotalXP()).toBe(68000)
    })

    it('never writes a null plan over the account\u2019s answers', async () => {
      maybeSingle.mockResolvedValue({ data: cloudRow({ settings: { plan: CLOUD_PLAN } }), error: null })
      pushProfileScalars()
      await settled(1)
      for (const call of update.mock.calls as unknown as [Record<string, unknown>][]) {
        const plan = (call[0].settings as { plan: PlanState | null }).plan
        expect(plan?.placement).toBe('true-count')
      }
    })

    it('writes nothing at all when the row cannot be read', async () => {
      // No merge, no write: better a missed push than an overwrite.
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      maybeSingle.mockResolvedValue({ data: null, error: new Error('network down') })

      pushProfileScalars()
      await vi.waitFor(() => expect(error).toHaveBeenCalled())

      expect(update).not.toHaveBeenCalled()
      error.mockRestore()
    })

    it('keeps merging on every push until one merge has gone through', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      maybeSingle.mockResolvedValueOnce({ data: null, error: new Error('network down') })
      pushProfileScalars()
      await vi.waitFor(() => expect(error).toHaveBeenCalled())
      error.mockRestore()

      // Second push, network back: still a merge, because none has succeeded.
      maybeSingle.mockResolvedValue({ data: cloudRow({ settings: { plan: CLOUD_PLAN } }), error: null })
      pushProfileScalars()
      await settled(1)

      expect(maybeSingle).toHaveBeenCalledTimes(2)
      expect(lastPlan()).toEqual(CLOUD_PLAN)
    })

    it('does not count a merge whose write was refused', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      maybeSingle.mockResolvedValue({ data: cloudRow({ settings: { plan: CLOUD_PLAN } }), error: null })
      writeSelect.mockResolvedValueOnce({ data: null, error: new Error('permission denied') })
      await expect(syncProfileOnSignIn()).rejects.toThrow()

      pushProfileScalars()
      await settled(2)
      error.mockRestore()

      // The retry read the row again rather than trusting a merge that never
      // reached the cloud.
      expect(maybeSingle).toHaveBeenCalledTimes(2)
    })

    it('still writes this device\u2019s numbers once a merge has happened — after reading the row again', async () => {
      // Turned around on 22 Nov 2026. This used to pin "no second read": the
      // later pushes wrote `settings` blind, and a device that had fallen
      // behind took paid weeks and stages off the account (see "a push from
      // a device that has fallen behind" below). Every push reads first now.
      await syncProfileOnSignIn()
      expect(maybeSingle).toHaveBeenCalledTimes(1)

      levelSystem.setTotalXP(777)
      pushProfileScalars()
      await settled(2)

      expect(maybeSingle).toHaveBeenCalledTimes(2)
      expect(maybeSingle.mock.invocationCallOrder[1]).toBeLessThan(update.mock.invocationCallOrder[1])
      // The level is not max-merged here: the database trigger guards it.
      expect(lastWrite()).toMatchObject({ level_xp: 777 })
    })

    it('carries the plan as this device holds it on those plain writes', async () => {
      await syncProfileOnSignIn()
      setPlacement('bet-spread')
      setProfile({ goal: 'serious', commitment: 'heavy', daysPerWeek: 7, minutesPerDay: 60 })

      pushProfileScalars()
      await settled(2)

      expect(lastPlan()).toMatchObject({
        placement: 'bet-spread',
        profile: { goal: 'serious', commitment: 'heavy', daysPerWeek: 7, minutesPerDay: 60 },
        updatedAt: planStateUpdatedAt(),
      })
    })

    it('goes back to merging after a sign-out', async () => {
      await syncProfileOnSignIn()
      resetProfileSync()

      // The next account on this page: its first write must read first.
      maybeSingle.mockResolvedValue({ data: cloudRow({ settings: { plan: CLOUD_PLAN, theme: 'felt' } }), error: null })
      localStorage.clear()
      pushProfileScalars()
      await settled(2)

      expect(maybeSingle).toHaveBeenCalledTimes(2)
      expect(lastPlan()).toEqual(CLOUD_PLAN)
      expect(lastSettings().theme).toBe('felt')
    })

    it('forgets the previous account\u2019s settings on a sign-out', async () => {
      // Keys carried through for account A must not be written into B's row.
      maybeSingle.mockResolvedValue({ data: cloudRow({ settings: { theme: 'felt', secret: 'A' } }), error: null })
      await syncProfileOnSignIn()
      resetProfileSync()
      localStorage.clear()

      maybeSingle.mockResolvedValue({ data: cloudRow({ settings: {} }), error: null })
      await syncProfileOnSignIn()

      expect(lastSettings()).not.toHaveProperty('theme')
      expect(lastSettings()).not.toHaveProperty('secret')
    })
  })

  describe('an answer given on this device goes to the account', () => {
    beforeEach(async () => {
      // A page that has already merged, so each push is one plain write.
      await syncProfileOnSignIn()
      vi.clearAllMocks()
      writeSelect.mockResolvedValue({ data: [{ id: 'u1' }], error: null })
      getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    })

    it('pushes after a short pause', async () => {
      setPlacement('deviations')
      expect(update).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(399)
      expect(update).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1))
      expect(lastPlan().placement).toBe('deviations')
    })

    it('makes one write of a burst — choosing a level writes three keys in one tick', async () => {
      setPlacement('deviations')
      setProfile({ goal: 'profit', commitment: 'regular', daysPerWeek: 4, minutesPerDay: 30 })
      setWelcomeSeen()
      await vi.advanceTimersByTimeAsync(200)
      markStageRead('rules')

      // The pause restarts with every answer.
      await vi.advanceTimersByTimeAsync(399)
      expect(update).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1))

      expect(lastPlan()).toMatchObject({
        placement: 'deviations',
        profile: { goal: 'profit', commitment: 'regular', daysPerWeek: 4, minutesPerDay: 30 },
        welcomeSeen: true,
        readStages: ['rules'],
      })

      await vi.advanceTimersByTimeAsync(5_000)
      expect(update).toHaveBeenCalledTimes(1)
    })

    it('does not push a merge straight back, or it would echo for ever', async () => {
      resetProfileSync()
      maybeSingle.mockResolvedValue({ data: cloudRow({ settings: { plan: CLOUD_PLAN } }), error: null })
      await syncProfileOnSignIn()
      expect(update).toHaveBeenCalledTimes(1)

      // Well past the pause: the merge wrote eight keys and rang nothing.
      await vi.advanceTimersByTimeAsync(5_000)
      expect(update).toHaveBeenCalledTimes(1)
      expect(maybeSingle).toHaveBeenCalledTimes(1)
    })
  })

  it('pushProfileScalars never throws into the caller', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    writeSelect.mockResolvedValue({ data: null, error: new Error('permission denied') })
    expect(() => pushProfileScalars()).not.toThrow()
    await vi.waitFor(() => expect(error).toHaveBeenCalled())
    error.mockRestore()
  })

  it('does nothing without a session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    await syncProfileOnSignIn()
    expect(from).not.toHaveBeenCalled()
  })
})

describe('profiles-sync: a push from a device that has fallen behind', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    levelSystem.reload()
    resetProfileSync()
    vi.useFakeTimers()
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    maybeSingle.mockResolvedValue({ data: cloudRow(), error: null })
    writeSelect.mockResolvedValue({ data: [{ id: 'u1' }], error: null })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('does not take paid weeks and stages off the account that another device added', async () => {
    // This tab merged yesterday. Since then the phone has been paid a week,
    // a streak and a stage. `settings` is one jsonb value: writing this
    // device's copy replaced the phone's, and the next sign-in anywhere found
    // those rewards unpaid and paid them again.
    maybeSingle.mockResolvedValue({
      data: cloudRow({ settings: { claimed_stages: ['rules'], claimed_rewards: ['week:2026-11-09'] } }),
      error: null,
    })
    await syncProfileOnSignIn()

    maybeSingle.mockResolvedValue({
      data: cloudRow({ settings: {
        claimed_stages: ['rules', 'hi-lo'],
        claimed_rewards: ['week:2026-11-09', 'week:2026-11-16', 'weekstreak:2026-11-09:2'],
        theme: 'felt',
      } }),
      error: null,
    })
    // And this tab earns something of its own.
    setClaimedStages([...getClaimedStages(), 'basic-strategy'])
    levelSystem.setTotalXP(900)

    await pushProfileScalarsNow()

    const settings = lastSettings()
    expect(new Set(settings.claimed_stages as string[])).toEqual(new Set(['rules', 'hi-lo', 'basic-strategy']))
    expect(new Set(settings.claimed_rewards as string[]))
      .toEqual(new Set(['week:2026-11-09', 'week:2026-11-16', 'weekstreak:2026-11-09:2']))
    // A key the other device added since is carried, not dropped.
    expect(settings.theme).toBe('felt')
    // The numbers still go up as this device holds them.
    expect(lastWrite()).toMatchObject({ level_xp: 900 })
  })

  it('reads before every write, and writes nothing when the read fails', async () => {
    await syncProfileOnSignIn()
    maybeSingle.mockResolvedValue({ data: null, error: new Error('network down') })

    await expect(pushProfileScalarsNow()).rejects.toThrow('network down')
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('pushProfileScalarsNow reports a refused write to the caller that waits for it', async () => {
    await syncProfileOnSignIn()
    writeSelect.mockResolvedValue({ data: null, error: new Error('permission denied') })
    await expect(pushProfileScalarsNow()).rejects.toThrow('permission denied')
  })

  it('pushProfileScalarsNow resolves once the write has landed', async () => {
    levelSystem.setTotalXP(450)
    await expect(pushProfileScalarsNow()).resolves.toBeUndefined()
    expect(lastWrite()).toMatchObject({ level_xp: 450 })
  })
})

describe('profiles-sync: an answer that arrives for an account no longer here', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    levelSystem.reload()
    resetProfileSync()
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    writeSelect.mockResolvedValue({ data: [{ id: 'u1' }], error: null })
  })

  /** Hold the next read open; returns the function that lets it answer. */
  function holdRead(row: Record<string, unknown>): () => void {
    let answer = () => {}
    maybeSingle.mockImplementationOnce(() => new Promise(resolve => {
      answer = () => resolve({ data: row, error: null })
    }))
    return () => answer()
  }

  it('the sign-in merge puts nothing on the device after a sign-out', async () => {
    // A's row is still on its way when A signs out and the device is wiped.
    // Written now, A's level and paid stages would sit in storage with no
    // owner and be merged into whoever signs in next.
    const answer = holdRead(cloudRow({ level_xp: 68000, settings: { claimed_stages: ['rules'], plan: CLOUD_PLAN } }))
    const merge = syncProfileOnSignIn()
    await vi.waitFor(() => expect(maybeSingle).toHaveBeenCalledTimes(1))

    resetProfileSync()
    answer()
    await merge

    expect(levelSystem.getTotalXP()).toBe(0)
    expect(getClaimedStages()).toEqual([])
    expect(getPlacement()).toBeNull()
    expect(update).not.toHaveBeenCalled()
  })

  it('a plain push writes nothing after a sign-out either', async () => {
    maybeSingle.mockResolvedValueOnce({ data: cloudRow({ settings: { plan: CLOUD_PLAN } }), error: null })
    await syncProfileOnSignIn()
    expect(update).toHaveBeenCalledTimes(1)

    const answer = holdRead(cloudRow({ settings: { plan: CLOUD_PLAN } }))
    const push = pushProfileScalarsNow()
    await vi.waitFor(() => expect(maybeSingle).toHaveBeenCalledTimes(2))

    // The wipe: the device now holds nothing, and that nothing must not be
    // written over the account's plan.
    resetProfileSync()
    localStorage.clear()
    answer()
    await push

    expect(update).toHaveBeenCalledTimes(1)
  })

  it('counts an award made while the merge was reading', async () => {
    // The device's numbers used to be read before the request left, so XP
    // earned while it was out was set back to the older figure.
    const answer = holdRead(cloudRow({ level_xp: 100 }))
    const merge = syncProfileOnSignIn()
    await vi.waitFor(() => expect(maybeSingle).toHaveBeenCalledTimes(1))

    levelSystem.setTotalXP(250)
    answer()
    await merge

    expect(levelSystem.getTotalXP()).toBe(250)
    expect(lastWrite()).toMatchObject({ level_xp: 250 })
  })
})

describe('profiles-sync: the casino trial count travels in settings.casino_trial_hands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    levelSystem.reload()
    resetProfileSync()
    vi.useFakeTimers()
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    maybeSingle.mockResolvedValue({ data: cloudRow(), error: null })
    writeSelect.mockResolvedValue({ data: [{ id: 'u1' }], error: null })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('a wiped device gets the hands it played back, not ten new ones', async () => {
    // Signed out and in again: the local count went with the wipe.
    maybeSingle.mockResolvedValue({ data: cloudRow({ settings: { casino_trial_hands: 10 } }), error: null })
    expect(readTrialHandsUsed()).toBeNull()

    await syncProfileOnSignIn()

    expect(readTrialHandsUsed()).toBe(10)
    expect(lastSettings().casino_trial_hands).toBe(10)
  })

  it('hands played here reach an account that has fewer', async () => {
    maybeSingle.mockResolvedValue({ data: cloudRow({ settings: { casino_trial_hands: 2, theme: 'felt' } }), error: null })
    setTrialHandsUsed(6)

    await syncProfileOnSignIn()

    expect(readTrialHandsUsed()).toBe(6)
    expect(lastSettings().casino_trial_hands).toBe(6)
    expect(lastSettings().theme).toBe('felt')
  })

  it('an account that never played is known as zero after the merge', async () => {
    await syncProfileOnSignIn()
    // Written, not absent: this is what lets the trial be offered at all.
    expect(readTrialHandsUsed()).toBe(0)
    expect(lastSettings().casino_trial_hands).toBe(0)
  })

  it('leaves the count unknown when the merge could not read the account', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: new Error('offline') })
    await expect(syncProfileOnSignIn()).rejects.toThrow()
    expect(readTrialHandsUsed()).toBeNull()
  })

  it('a push from a tab that is behind does not give hands back', async () => {
    await syncProfileOnSignIn()
    setTrialHandsUsed(3)
    // The phone played the rest meanwhile.
    maybeSingle.mockResolvedValue({ data: cloudRow({ settings: { casino_trial_hands: 10 } }), error: null })

    await pushProfileScalarsNow()

    expect(lastSettings().casino_trial_hands).toBe(10)
    // And this tab learns it, so its table stops dealing.
    expect(readTrialHandsUsed()).toBe(10)
  })

  it('reads a damaged cloud value as no hands, and a huge one as all of them', async () => {
    maybeSingle.mockResolvedValue({ data: cloudRow({ settings: { casino_trial_hands: 'many' } }), error: null })
    await syncProfileOnSignIn()
    expect(readTrialHandsUsed()).toBe(0)

    maybeSingle.mockResolvedValue({ data: cloudRow({ settings: { casino_trial_hands: 4000 } }), error: null })
    await pushProfileScalarsNow()
    expect(readTrialHandsUsed()).toBe(10)
  })
})
