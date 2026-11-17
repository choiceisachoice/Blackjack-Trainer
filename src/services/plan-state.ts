import {
  CURRICULUM,
  getPlacement,
  setPlacement,
  hasSkippedPlacement,
  setPlacementSkipped,
  getReadStages,
  setReadStages,
  type StageId,
} from './curriculum'
import { getProfile, setProfile, type LearnerProfile } from './learner-profile'
import { hasSeenWelcome, setWelcomeSeen } from './onboarding'
import {
  getStartLevel,
  hasSeenTour,
  setTourSeen,
  isRecommendationDone,
  setRecommendationDone,
} from './recommendation'
import { hasSeenLevelIntro, markLevelIntroSeen } from './level-intro'
import { planStateHydrated, planStateUpdatedAt, withoutRinging } from './plan-state-signal'

/**
 * Everything the learner has told the plan, as one value that can travel.
 *
 * These answers lived in eight `localStorage` keys and nowhere else. Signing
 * out wipes every `bjt_*` key — that wipe is a security boundary and stays —
 * and nothing brought these back, so the next sign-in met an account that had
 * "never been asked": the welcome screen again, "where are you starting
 * from?" again, the goal and the pace reset to their defaults (Darius,
 * 17 Nov 2026). The session history came back from the cloud, so the plan
 * then showed real progress under a question about whether you had ever
 * played.
 *
 * It rides in `profiles.settings`, the jsonb column the claimed stages already
 * use, so nothing has to migrate.
 */
export interface PlanState {
  placement: StageId | null
  skipped: boolean
  readStages: StageId[]
  profile: LearnerProfile | null
  /** The level answer behind the placement, kept for the recommendation's wording. */
  startLevel: string | null
  welcomeSeen: boolean
  tourSeen: boolean
  recommendationDone: boolean
  levelIntroSeen: boolean
  /** When an answer was last given, in ms. Decides whose answers win a merge. */
  updatedAt: number
}

const isStageId = (v: unknown): v is StageId =>
  typeof v === 'string' && CURRICULUM.some(s => s.id === v)

/** The plan answers as this device holds them. */
export function readPlanState(): PlanState {
  return {
    placement: getPlacement(),
    skipped: hasSkippedPlacement(),
    readStages: getReadStages(),
    profile: getProfile(),
    startLevel: getStartLevel(),
    welcomeSeen: hasSeenWelcome(),
    tourSeen: hasSeenTour(),
    recommendationDone: isRecommendationDone(),
    levelIntroSeen: hasSeenLevelIntro(),
    updatedAt: planStateUpdatedAt(),
  }
}

/**
 * Read a plan state out of whatever the cloud row holds.
 *
 * Tolerant on purpose: the value is jsonb written by any build that ever
 * shipped, and a field this build does not recognise must cost that field,
 * never the sign-in.
 *
 * @param raw - The `plan` entry of `profiles.settings`
 * @returns The state, or null when there is none
 */
export function parsePlanState(raw: unknown): PlanState | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const profile = parseProfile(r.profile)
  return {
    placement: isStageId(r.placement) ? r.placement : null,
    skipped: r.skipped === true,
    readStages: Array.isArray(r.readStages) ? r.readStages.filter(isStageId) : [],
    profile,
    startLevel: typeof r.startLevel === 'string' ? r.startLevel : null,
    welcomeSeen: r.welcomeSeen === true,
    tourSeen: r.tourSeen === true,
    recommendationDone: r.recommendationDone === true,
    levelIntroSeen: r.levelIntroSeen === true,
    updatedAt: typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : 0,
  }
}

/** A profile from jsonb: the two required answers, the time budget if present. */
function parseProfile(raw: unknown): LearnerProfile | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const goals = ['curious', 'stop-losing', 'profit', 'serious']
  const paces = ['light', 'casual', 'regular', 'heavy']
  if (typeof r.goal !== 'string' || !goals.includes(r.goal)) return null
  if (typeof r.commitment !== 'string' || !paces.includes(r.commitment)) return null
  const profile: LearnerProfile = {
    goal: r.goal as LearnerProfile['goal'],
    commitment: r.commitment as LearnerProfile['commitment'],
  }
  if (typeof r.daysPerWeek === 'number' && r.daysPerWeek >= 1 && r.daysPerWeek <= 7) {
    profile.daysPerWeek = Math.round(r.daysPerWeek)
  }
  if (r.minutesPerDay === 10 || r.minutesPerDay === 20 || r.minutesPerDay === 30 || r.minutesPerDay === 60) {
    profile.minutesPerDay = r.minutesPerDay
  }
  return profile
}

/**
 * One state out of this device's and the cloud's.
 *
 * Two kinds of fact, two rules:
 *
 *  - **Things that only ever become true** — a greeting seen, a page marked
 *    read, the question declined. Seen on either side is seen: OR, and a
 *    union for the reading list.
 *  - **Answers that can be changed** — where the plan starts, what it aims
 *    for, how much time there is. The side that answered last wins, as a
 *    unit, so a goal from one device is never paired with a pace from
 *    another. A side with no answer at all never beats one that has one,
 *    whatever its clock says — that is the sign-in after a sign-out.
 *
 * @param local - What this device holds
 * @param cloud - What the account's row holds, or null if it has none
 */
export function mergePlanState(local: PlanState, cloud: PlanState | null): PlanState {
  if (!cloud) return local

  const answered = (s: PlanState) => s.placement !== null || s.profile !== null
  const localWins = answered(local) && (!answered(cloud) || local.updatedAt >= cloud.updatedAt)
  const answers = localWins ? local : cloud

  return {
    placement: answers.placement,
    profile: answers.profile,
    startLevel: answers.startLevel,
    // Declining is undone by answering, on either side.
    skipped: answers.placement === null && (local.skipped || cloud.skipped),
    readStages: Array.from(new Set([...local.readStages, ...cloud.readStages])),
    welcomeSeen: local.welcomeSeen || cloud.welcomeSeen,
    tourSeen: local.tourSeen || cloud.tourSeen,
    recommendationDone: localWins
      ? local.recommendationDone
      : local.recommendationDone || cloud.recommendationDone,
    levelIntroSeen: local.levelIntroSeen || cloud.levelIntroSeen,
    updatedAt: Math.max(local.updatedAt, cloud.updatedAt),
  }
}

const START_LEVEL_KEY = 'bjt_start_level'

/**
 * Put a merged state onto this device and tell the screens to read again.
 *
 * Written through the modules' own setters so each key keeps its one writer;
 * silenced, because a merge is not the learner answering anything. Flags are
 * only ever raised here — nothing in a merge can make a seen greeting unseen.
 *
 * @param state - The merged state
 */
export function writePlanState(state: PlanState): void {
  withoutRinging(() => {
    if (state.placement) setPlacement(state.placement)
    if (state.profile) setProfile(state.profile)
    if (state.skipped) setPlacementSkipped()
    setReadStages(state.readStages)
    if (state.welcomeSeen) setWelcomeSeen()
    if (state.tourSeen) setTourSeen()
    if (state.levelIntroSeen) markLevelIntroSeen()
    // The level answer has no plain setter: `setRecommendation` also reopens
    // the suggestion card, which is right for a tap and wrong for a merge.
    try {
      if (state.startLevel) localStorage.setItem(START_LEVEL_KEY, state.startLevel)
    } catch {
      /* storage unavailable — the card words itself from the placement */
    }
    if (state.recommendationDone) setRecommendationDone()
  })
  planStateHydrated(state.updatedAt)
}
