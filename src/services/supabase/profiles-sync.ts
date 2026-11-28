import { levelSystem } from '../level-system'
import { achievementEngine } from '../achievements/achievement-engine'
import { hasSeenOnboarding, setOnboardingSeen } from '../onboarding'
import { requireSupabase, isSupabaseConfigured } from './client'
import { getClaimedStages, setClaimedStages } from '../stage-rewards'
import { getClaimedRewards, setClaimedRewards, mergeClaimedRewards } from '../weekly-rewards'
import { CURRICULUM, type StageId } from '../curriculum'
import {
  readPlanState, parsePlanState, mergePlanState, writePlanState, type PlanState,
} from '../plan-state'
import { onPlanStateChanged } from '../plan-state-signal'
import { setTrialHandsUsed, toTrialHands, trialHandsUsed } from '../casino-trial'
import { useBankrollTrackerStore } from '../../store/bankroll-tracker-store'

const isStageId = (v: unknown): v is StageId =>
  typeof v === 'string' && CURRICULUM.some(s => s.id === v)

/**
 * The monotonic profile state mirrored in the `profiles` row.
 *
 * All fields only ever move one way — the numbers grow, and `onboardingSeen`
 * goes false → true — so reconciling by max (logical OR for the boolean) is
 * always safe and never loses progress.
 */
interface ProfileScalars {
  levelXp: number
  simCount: number
  simBestEdge: number
  onboardingSeen: boolean
  /**
   * Curriculum stages whose XP has already been paid.
   *
   * A set rather than a number, but it belongs here for the same reason as the
   * rest: it only ever grows, so a union is always safe. It is kept in the
   * `settings` jsonb the schema already carries, so nothing had to migrate.
   */
  claimedStages: StageId[]
  /**
   * Kept weeks and week-streak milestones whose XP has already been paid
   * (`weekly-rewards.ts`). The same kind of thing as the stages above — a set
   * that only grows — and it travels the same way, as `settings.claimed_rewards`.
   */
  claimedRewards: string[]
  /**
   * Hands played of the casino table's free trial (`casino-trial.ts`), as
   * `settings.casino_trial_hands`. A number that only grows, reconciled by
   * max like the XP — but with no database trigger behind it: the client is
   * the only thing keeping it, which is enough for a trial and is said so
   * where the trial is defined.
   */
  trialHands: number
  /**
   * The learner's answers to the plan — where it starts, what it aims for,
   * how much time there is, which greetings were seen. Null on the cloud side
   * until the first write. See `plan-state.ts` for why it travels at all.
   */
  plan: PlanState | null
  /**
   * The Casino Session Tracker's starting bankroll, as
   * `settings.starting_bankroll`. The tracker's sessions come back from the
   * cloud after a sign-out; the figure they are added to did not, so a
   * $5,000 bankroll that had lost $1,200 read as −$1,200. Null when none is set.
   */
  startingBankroll: StartingBankroll | null
}

/** A starting bankroll and when it was last set by hand (ms; 0 = before this was tracked). */
export interface StartingBankroll {
  amount: number
  updatedAt: number
}

/** Read `settings.starting_bankroll`, or null if it is missing or malformed. */
function parseStartingBankroll(raw: unknown): StartingBankroll | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.amount !== 'number' || !Number.isFinite(r.amount) || r.amount <= 0) return null
  const updatedAt = typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : 0
  return { amount: r.amount, updatedAt }
}

/**
 * Which starting bankroll stands: the cloud's, unless this device's was set
 * later. Not a max — it is a figure someone typed, and lowering it is as
 * deliberate as raising it. A tie goes to the cloud, so two devices holding
 * figures from before this was tracked (`updatedAt` 0) settle on one.
 *
 * @param local - This device's figure, or null if it has none
 * @param cloud - The account's figure, or null if it has none
 */
export function mergeStartingBankroll(
  local: StartingBankroll | null,
  cloud: StartingBankroll | null,
): StartingBankroll | null {
  if (!local) return cloud
  if (!cloud) return local
  return local.updatedAt > cloud.updatedAt ? local : cloud
}

/** The tracker's figure on this device. Zero is "not set": the tracker refuses 0, and the wipe leaves it at 0. */
function localStartingBankroll(): StartingBankroll | null {
  const { startingBankroll, startingBankrollUpdatedAt } = useBankrollTrackerStore.getState()
  return startingBankroll > 0 ? { amount: startingBankroll, updatedAt: startingBankrollUpdatedAt ?? 0 } : null
}

/** Put the merged figure on this device if it is not the one already there. */
function applyStartingBankroll(merged: StartingBankroll | null): void {
  if (!merged) return
  const local = localStartingBankroll()
  if (local && local.amount === merged.amount && local.updatedAt === merged.updatedAt) return
  useBankrollTrackerStore.getState().hydrateStartingBankroll(merged.amount, merged.updatedAt)
}

/** Whether two plan states hold the same answers, whatever order their keys and lists are in. */
function samePlan(a: PlanState, b: PlanState): boolean {
  const canonical = (p: PlanState) => JSON.stringify(
    { ...p, readStages: [...p.readStages].sort() },
    Object.keys(p).sort().concat(Object.keys(p.profile ?? {}).sort()),
  )
  return canonical(a) === canonical(b)
}

/** Current user id from the local session (fast, no network). */
async function currentUserId(): Promise<string | null> {
  const { data } = await requireSupabase().auth.getSession()
  return data.session?.user.id ?? null
}

/** Read the current local progress scalars from their engines. */
function localScalars(): ProfileScalars {
  return {
    levelXp: levelSystem.getTotalXP(),
    simCount: achievementEngine.getSimCount(),
    simBestEdge: achievementEngine.getBestSimEdge(),
    onboardingSeen: hasSeenOnboarding(),
    claimedStages: getClaimedStages(),
    claimedRewards: getClaimedRewards(),
    trialHands: trialHandsUsed(),
    plan: readPlanState(),
    startingBankroll: localStartingBankroll(),
  }
}

/** The profile row as the cloud holds it right now. */
interface CloudProfile extends ProfileScalars {
  /**
   * The whole `settings` object, so a write can carry it back: it is a single
   * jsonb value, and writing a fresh object would drop any key this module
   * does not know about.
   *
   * Returned with each read and handed to the write that follows it. It used
   * to be a module variable, which a read for one account could fill after
   * another account had taken over the page.
   */
  settings: Record<string, unknown>
}

/** Fetch the user's progress scalars from the cloud (zeros if no row yet). */
async function fetchCloud(userId: string): Promise<CloudProfile> {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('level_xp, sim_count, sim_best_edge, onboarding_seen, settings')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) {
    return { levelXp: 0, simCount: 0, simBestEdge: 0, onboardingSeen: false, claimedStages: [], claimedRewards: [], trialHands: 0, plan: null, startingBankroll: null, settings: {} }
  }
  const settings: Record<string, unknown> = data.settings && typeof data.settings === 'object'
    ? data.settings as Record<string, unknown>
    : {}
  const claimed = settings.claimed_stages
  const rewards = settings.claimed_rewards
  return {
    levelXp: data.level_xp ?? 0,
    simCount: data.sim_count ?? 0,
    simBestEdge: data.sim_best_edge ?? 0,
    onboardingSeen: data.onboarding_seen ?? false,
    claimedStages: Array.isArray(claimed) ? (claimed.filter(isStageId) as StageId[]) : [],
    claimedRewards: Array.isArray(rewards) ? mergeClaimedRewards(rewards, []) : [],
    trialHands: toTrialHands(settings.casino_trial_hands),
    plan: parsePlanState(settings.plan),
    startingBankroll: parseStartingBankroll(settings.starting_bankroll),
    settings,
  }
}

/**
 * Write the progress scalars onto the user's profile row.
 *
 * An `update`, not an `upsert` — and the difference cost six weeks of
 * progress. The row is created by the signup trigger and a client may only
 * read and update its own (migration 20260724120000, deliberately no INSERT
 * policy). Postgres checks the INSERT policy for `INSERT … ON CONFLICT DO
 * UPDATE` before it looks at the conflict, so from the day that policy went
 * live every upsert here answered 403: the sign-in merge logged "profile sync
 * failed" and the fire-and-forget push after each XP award said nothing at
 * all. Level, XP, the sim counters and the paid stages lived only in
 * `localStorage`, and the first sign-out took them with it.
 *
 * `.select('id')` plus a row check, for the same reason as everywhere else:
 * supabase-js does not report an update that matched nothing.
 *
 * @param settings The row's `settings` as just read, carried through under the keys written here
 */
async function writeCloud(userId: string, s: ProfileScalars, settings: Record<string, unknown>): Promise<void> {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .update({
      level_xp: s.levelXp,
      sim_count: s.simCount,
      sim_best_edge: s.simBestEdge,
      onboarding_seen: s.onboardingSeen,
      settings: {
        ...settings,
        claimed_stages: s.claimedStages,
        claimed_rewards: s.claimedRewards,
        casino_trial_hands: s.trialHands,
        plan: s.plan,
        // Only when there is one: an absent figure leaves the cloud's in place.
        ...(s.startingBankroll ? { starting_bankroll: s.startingBankroll } : {}),
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error(`profile row not found for user ${userId}`)
}

/**
 * Whether this page load has merged with the cloud yet.
 *
 * Until it has, a plain write is dangerous: the device may hold nothing — the
 * minute after a sign-in, before the merge lands — and `settings` is one
 * jsonb value, so writing it would replace the account's plan answers and its
 * paid stages with an empty set. XP has a database trigger against exactly
 * this; `settings` does not, so the guard is here.
 */
let hasMerged = false

/**
 * Counts sign-outs and account changes (`resetProfileSync`). A read remembers
 * the number it was issued under; if it has moved on by the time the answer
 * arrives, the answer belongs to an account that is no longer on this device
 * and nothing is done with it — neither written here nor sent back.
 */
let generation = 0

/**
 * On sign-in: reconcile local and cloud progress by taking the max of each
 * scalar (level XP and the sim counters only ever grow), then persist the
 * merged values both locally and to the cloud. This is what keeps the level
 * from resetting to 1 on a fresh device. Idempotent — safe on every sign-in.
 *
 * Note: XP is reconciled by max, not sum, so progress made on two devices
 * between syncs doesn't add up. Acceptable for a single-user trainer that is
 * almost always used online (login is required).
 */
export async function syncProfileOnSignIn(): Promise<void> {
  if (!isSupabaseConfigured) return
  const userId = await currentUserId()
  if (!userId) return
  const issued = generation
  const cloud = await fetchCloud(userId)
  // Signed out, or another account, while the request was out: this is the
  // previous account's level and its paid stages. Written to the device now,
  // they would be merged into whoever signs in next.
  if (issued !== generation) return
  // Read after the fetch, not before: an award made while the request was in
  // flight is in here, and a snapshot from before would write the level
  // without it over the one with it.
  const local = localScalars()
  const merged: ProfileScalars = {
    levelXp: Math.max(local.levelXp, cloud.levelXp),
    simCount: Math.max(local.simCount, cloud.simCount),
    simBestEdge: Math.max(local.simBestEdge, cloud.simBestEdge),
    // OR, not "cloud wins": dismissing the checklist on one device must not
    // make it reappear on another.
    onboardingSeen: local.onboardingSeen || cloud.onboardingSeen,
    // Union, for the same reason as the max above: a stage paid on either side
    // is paid. Missing this is what let a sign-out/sign-in cycle collect every
    // stage award again.
    claimedStages: Array.from(new Set([...local.claimedStages, ...cloud.claimedStages])),
    // Union again: a week paid on either side is paid.
    claimedRewards: mergeClaimedRewards(local.claimedRewards, cloud.claimedRewards),
    // Max: a trial hand played on either side is played. A device that was
    // wiped holds zero and must not hand the ten hands out again.
    trialHands: Math.max(local.trialHands, cloud.trialHands),
    plan: mergePlanState(local.plan ?? readPlanState(), cloud.plan),
    startingBankroll: mergeStartingBankroll(local.startingBankroll, cloud.startingBankroll),
  }
  levelSystem.setTotalXP(merged.levelXp)
  achievementEngine.setSimCounters(merged.simCount, merged.simBestEdge)
  setOnboardingSeen(merged.onboardingSeen)
  setClaimedStages(merged.claimedStages)
  setClaimedRewards(merged.claimedRewards)
  // Written even at zero: the written count is what tells the device that the
  // account's answer has arrived, and only then is the trial offered.
  setTrialHandsUsed(merged.trialHands)
  if (merged.plan) writePlanState(merged.plan)
  applyStartingBankroll(merged.startingBankroll)
  await writeCloud(userId, merged, cloud.settings)
  if (issued === generation) hasMerged = true
}

/**
 * Push the current local progress scalars to the cloud and wait for the
 * answer. Rejects when the cloud did not take them — for the caller that has
 * to know, the sign-out; everything else uses `pushProfileScalars`.
 *
 * The numbers are written as this device holds them, without the max-merge —
 * the `protect_progress_columns` trigger on the row is what stops a device
 * that has lost its local copy from writing a lower number over the cloud's.
 *
 * The two paid sets have no such trigger, so they are read first and written
 * as a union. Before, every push after the first merge replaced `settings`
 * with this device's copy: a tab left open since yesterday wrote its shorter
 * list of paid weeks and stages over the one another device had extended,
 * and the next sign-in anywhere found those rewards unpaid and paid them
 * again. A sign-out while the read is out ends the push there: the device has
 * been wiped, and its nothing is not written over the account's plan.
 *
 * Read-then-write, not atomic: a claim another device writes between this
 * read and this write is still overwritten. That window is one round trip
 * wide instead of as wide as the tab is old; closing it needs the union done
 * in the database (a trigger or an RPC), which is a migration.
 */
export async function pushProfileScalarsNow(): Promise<void> {
  if (!isSupabaseConfigured) return
  const userId = await currentUserId()
  if (!userId) return
  // Not merged yet on this page load: merge instead of overwriting.
  if (!hasMerged) {
    await syncProfileOnSignIn()
    return
  }
  const issued = generation
  const cloud = await fetchCloud(userId)
  if (issued !== generation) return
  const local = localScalars()
  // The trial count has no trigger either. Another device may have played
  // hands since this one merged: the greater count is written, and kept here
  // too, so the table on this device stops offering hands that are gone.
  const trialHands = Math.max(local.trialHands, cloud.trialHands)
  if (trialHands > local.trialHands) setTrialHandsUsed(trialHands)
  // The plan answers have no trigger either, and carry their own time: a tab
  // left open since before another device re-took the placement wrote its
  // older answers over the newer ones. Merged, and the newer kept here too.
  const plan = mergePlanState(local.plan ?? readPlanState(), cloud.plan)
  if (local.plan && !samePlan(plan, local.plan)) writePlanState(plan)
  const startingBankroll = mergeStartingBankroll(local.startingBankroll, cloud.startingBankroll)
  applyStartingBankroll(startingBankroll)
  await writeCloud(userId, {
    ...local,
    claimedStages: Array.from(new Set([...local.claimedStages, ...cloud.claimedStages])),
    claimedRewards: mergeClaimedRewards(local.claimedRewards, cloud.claimedRewards),
    trialHands,
    plan,
    startingBankroll,
  }, cloud.settings)
}

/**
 * Push the current local progress scalars to the cloud. Fire-and-forget and
 * best-effort: a failed push is reconciled by the max-merge on the next
 * sign-in. Safe to call after any XP or simulation change. See
 * `pushProfileScalarsNow` for what is written.
 */
export function pushProfileScalars(): void {
  if (!isSupabaseConfigured) return
  pushProfileScalarsNow().catch(e => console.error('profile cloud push failed', e))
}

/**
 * Forget that a merge happened — on sign-out, so the next account's first
 * write on this page is a merge again and not an overwrite. Anything still on
 * its way back from the cloud for the previous account is disowned with it.
 */
export function resetProfileSync(): void {
  hasMerged = false
  generation++
}

/** A pending push of the plan answers, so a burst of taps is one write. */
let planPush: ReturnType<typeof setTimeout> | null = null

// An answer given on this device goes to the account. Debounced: choosing a
// level writes the placement, the profile and the suggestion in one tick.
onPlanStateChanged(origin => {
  if (origin !== 'local' || !isSupabaseConfigured) return
  if (planPush) clearTimeout(planPush)
  planPush = setTimeout(() => {
    planPush = null
    pushProfileScalars()
  }, 400)
})
