import { CURRICULUM, stageIndex, type StageId, type StageProgress } from './curriculum'

/**
 * XP for finishing a curriculum stage.
 *
 * Completing a stage is the largest single accomplishment the app has, and it
 * paid nothing: a session was worth 10–50 XP and a gold achievement 100, while
 * clearing an entire stage — three qualifying drills above an accuracy floor —
 * was worth zero. Rewarding it is what makes the plan the spine of progression
 * rather than a checklist sitting beside it.
 *
 * The award grows with depth, because later stages take longer and demand more.
 */

const CLAIMED_KEY = 'bjt_claimed_stages'

/** Base award for the first stage; each later stage adds one step. */
export const STAGE_XP_BASE = 150
export const STAGE_XP_STEP = 50

/**
 * XP for completing a given stage.
 *
 * **Reading stages pay nothing**, and that is the whole point: the app can
 * verify a drill, it cannot verify that someone read a page. Ticking "mark as
 * read" is an honesty checkbox, not an achievement — and paying it the same
 * 150 XP as three drills above a 90% accuracy bar had two consequences, both
 * bad:
 *
 *  - A brand-new account jumped two levels on its very first click, before it
 *    had done anything at all. Level 2 needs 50 XP and level 3 needs 200.
 *  - It made the number meaningless. If a checkbox and a proven skill are worth
 *    the same, the score stops saying anything about ability.
 *
 * The rule this restores, which the rest of the codebase already follows:
 * **the app rewards what it can measure.**
 */
export function stageXP(id: StageId): number {
  const index = stageIndex(id)
  if (index < 0) return 0
  const stage = CURRICULUM[index]
  if (!stage.drill) return 0
  return STAGE_XP_BASE + index * STAGE_XP_STEP
}

const isStageId = (v: unknown): v is StageId =>
  typeof v === 'string' && CURRICULUM.some(s => s.id === v)

/**
 * Stages whose XP has already been paid out.
 *
 * Persisted separately from progress on purpose. Progress is *derived* from
 * session history, so it can legitimately move backwards — a cloud sync that
 * replaces the local session list, for instance. Without a record of what was
 * already paid, the same stage could be awarded twice.
 */
export function getClaimedStages(): StageId[] {
  try {
    const raw = localStorage.getItem(CLAIMED_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isStageId) : []
  } catch {
    return []
  }
}

/** Record a stage as paid. Idempotent. */
export function markStageClaimed(id: StageId): void {
  setClaimedStages([...getClaimedStages(), id])
}

/**
 * Replace the claimed set, used by the sign-in sync.
 *
 * This list is why a stage is not paid twice, and it lived only in
 * `localStorage` — under a `bjt_*` key, which `clearLocalAppData` wipes on
 * sign-out as a security boundary. Progress itself is *derived* from session
 * history, and that history does come back from the cloud, so after a
 * sign-out/sign-in every finished stage looked unpaid and was paid again.
 * Level XP reconciles by `max`, so the inflated local total then won and was
 * pushed up: a sign-out was worth free XP, repeatedly.
 *
 * It now rides in `profiles.settings`, a jsonb column the schema already has,
 * and merges as a union — the set only ever grows, so there is no conflict to
 * resolve.
 *
 * @param ids - The full set of stages considered paid
 */
export function setClaimedStages(ids: readonly StageId[]): void {
  const next = Array.from(new Set(ids.filter(isStageId)))
  try {
    localStorage.setItem(CLAIMED_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable — the worst case is the award repeating next session */
  }
}

/** One stage that just became payable. */
export interface StageAward {
  stage: StageId
  /** Key for the stage name — the XP ledger entry is shown to the user. */
  titleKey: string
  xp: number
}

/**
 * Stages that are complete but not yet paid, in curriculum order.
 *
 * Pure: it reports what is owed and changes nothing. The caller pays and then
 * calls {@link markStageClaimed}, so a failure to award never silently marks a
 * stage as settled.
 */
export function pendingStageAwards(progress: readonly StageProgress[]): StageAward[] {
  const claimed = new Set(getClaimedStages())
  return progress
    .filter(p => p.done && !claimed.has(p.stage.id))
    .map(p => ({ stage: p.stage.id, titleKey: p.stage.titleKey, xp: stageXP(p.stage.id) }))
    // A zero award is not an award. Paying 0 XP would still fire a "you earned
    // something" path and mark the stage claimed for a reward that never came.
    .filter(a => a.xp > 0)
}

/**
 * Total XP the whole path is worth — used to show what the plan is worth
 * before anyone has finished a stage.
 */
export function totalStageXP(): number {
  return CURRICULUM.reduce((sum, s) => sum + stageXP(s.id), 0)
}

/** Whether finishing this stage is worth any XP at all. */
export function stagePaysXP(id: StageId): boolean {
  return stageXP(id) > 0
}
