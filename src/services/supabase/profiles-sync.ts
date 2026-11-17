import { levelSystem } from '../level-system'
import { achievementEngine } from '../achievements/achievement-engine'
import { hasSeenOnboarding, setOnboardingSeen } from '../onboarding'
import { requireSupabase, isSupabaseConfigured } from './client'
import { getClaimedStages, setClaimedStages } from '../stage-rewards'
import { CURRICULUM, type StageId } from '../curriculum'
import {
  readPlanState, parsePlanState, mergePlanState, writePlanState, type PlanState,
} from '../plan-state'
import { onPlanStateChanged } from '../plan-state-signal'

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
   * The learner's answers to the plan — where it starts, what it aims for,
   * how much time there is, which greetings were seen. Null on the cloud side
   * until the first write. See `plan-state.ts` for why it travels at all.
   */
  plan: PlanState | null
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
    plan: readPlanState(),
  }
}

/** Whatever else lives in `settings`, carried through an upsert untouched. */
let cloudSettings: Record<string, unknown> = {}

/** Fetch the user's progress scalars from the cloud (zeros if no row yet). */
async function fetchCloud(userId: string): Promise<ProfileScalars> {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('level_xp, sim_count, sim_best_edge, onboarding_seen, settings')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  cloudSettings = {}
  if (!data) {
    return { levelXp: 0, simCount: 0, simBestEdge: 0, onboardingSeen: false, claimedStages: [], plan: null }
  }
  // Read the whole object so the upsert can write it back: `settings` is a
  // single jsonb value, and upserting a fresh object would drop any key this
  // module does not know about.
  if (data.settings && typeof data.settings === 'object') {
    cloudSettings = data.settings as Record<string, unknown>
  }
  const claimed = cloudSettings.claimed_stages
  return {
    levelXp: data.level_xp ?? 0,
    simCount: data.sim_count ?? 0,
    simBestEdge: data.sim_best_edge ?? 0,
    onboardingSeen: data.onboarding_seen ?? false,
    claimedStages: Array.isArray(claimed) ? (claimed.filter(isStageId) as StageId[]) : [],
    plan: parsePlanState(cloudSettings.plan),
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
 */
async function writeCloud(userId: string, s: ProfileScalars): Promise<void> {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .update({
      level_xp: s.levelXp,
      sim_count: s.simCount,
      sim_best_edge: s.simBestEdge,
      onboarding_seen: s.onboardingSeen,
      settings: { ...cloudSettings, claimed_stages: s.claimedStages, plan: s.plan },
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error(`profile row not found for user ${userId}`)
  // What was just written is what the row holds now; the next write carries it.
  cloudSettings = { ...cloudSettings, claimed_stages: s.claimedStages, plan: s.plan }
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
  const local = localScalars()
  const cloud = await fetchCloud(userId)
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
    plan: mergePlanState(local.plan ?? readPlanState(), cloud.plan),
  }
  levelSystem.setTotalXP(merged.levelXp)
  achievementEngine.setSimCounters(merged.simCount, merged.simBestEdge)
  setOnboardingSeen(merged.onboardingSeen)
  setClaimedStages(merged.claimedStages)
  if (merged.plan) writePlanState(merged.plan)
  await writeCloud(userId, merged)
  hasMerged = true
}

/**
 * Push the current local progress scalars to the cloud. Fire-and-forget and
 * best-effort: a failed push is reconciled by the max-merge on the next
 * sign-in. Safe to call after any XP or simulation change.
 *
 * The local value is written as it is, without the max-merge — the
 * `protect_progress_columns` trigger on the row is what stops a device that
 * has lost its local copy from writing a lower number over the cloud's.
 */
export function pushProfileScalars(): void {
  if (!isSupabaseConfigured) return
  void (async () => {
    try {
      const userId = await currentUserId()
      if (!userId) return
      // Not merged yet on this page load: merge instead of overwriting.
      if (!hasMerged) await syncProfileOnSignIn()
      else await writeCloud(userId, localScalars())
    } catch (e) {
      console.error('profile cloud push failed', e)
    }
  })()
}

/**
 * Forget that a merge happened — on sign-out, so the next account's first
 * write on this page is a merge again and not an overwrite.
 */
export function resetProfileSync(): void {
  hasMerged = false
  cloudSettings = {}
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
