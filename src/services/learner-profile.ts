import { CURRICULUM, stageIndex, stageNeedsPro, type StageId } from './curriculum'

/**
 * What the learner wants and what they can give — asked before anything is
 * tested.
 *
 * The placement test only ever measured skill, which quietly assumes everyone
 * is heading for the same destination. They are not: someone curious about how
 * counting works does not need bet spreads or a live table, and telling them
 * their plan is "2 of 7 complete" forever is discouraging for no reason.
 *
 * Both answers do real work — the goal sets where the path *ends*, and the time
 * budget sets what a realistic pace looks like. Neither is a survey question.
 *
 * These come first for a second reason: everyone can answer them. The
 * experience ladder needs words like "true count" to be meaningful, and opening
 * an app with vocabulary a beginner cannot read is its own kind of unfair.
 */

// ── Goal ─────────────────────────────────────────────────────────────

export type Goal = 'curious' | 'stop-losing' | 'profit' | 'serious'

export interface GoalOption {
  value: Goal
  labelKey: string
  hintKey: string
  /** The last stage this goal actually requires. */
  stage: StageId
}

/**
 * Each goal ends at the last stage it genuinely needs.
 *
 * Deliberately honest about where the work stops. Counting is only worth money
 * once you size bets by the count, so "profit" cannot end before bet spread;
 * equally, understanding the idea does not require a live table, so "curious"
 * should not pretend it does.
 */
export const GOAL_OPTIONS: GoalOption[] = [
  {
    value: 'curious',
    labelKey: 'profile.goal.understand.label',
    hintKey: 'profile.goal.understand.hint',
    stage: 'true-count',
  },
  {
    value: 'stop-losing',
    labelKey: 'profile.goal.stop-losing.label',
    hintKey: 'profile.goal.stop-losing.hint',
    stage: 'deviations',
  },
  {
    value: 'profit',
    labelKey: 'profile.goal.win.label',
    hintKey: 'profile.goal.win.hint',
    stage: 'bet-spread',
  },
  {
    value: 'serious',
    labelKey: 'profile.goal.serious.label',
    hintKey: 'profile.goal.serious.hint',
    stage: 'table',
  },
]

/** Where the path ends for this goal. */
export function goalStage(goal: Goal): StageId {
  return GOAL_OPTIONS.find(o => o.value === goal)?.stage ?? 'table'
}

/**
 * The stages inside a goal that a free account cannot open.
 *
 * Every goal reaches at least one, because the true count is drilled on a
 * Pro-gated screen and sits fourth of seven. That is a pricing decision and not
 * this module's business — but the learner has to be told *before* they choose,
 * not after five questions and a plan they cannot finish.
 */
export function proStagesFor(goal: Goal): StageId[] {
  const end = stageIndex(goalStage(goal))
  return CURRICULUM.slice(0, end + 1).filter(stageNeedsPro).map(s => s.id)
}

/** The next, more ambitious goal, or null at the top of the ladder. */
export function nextGoalUp(goal: Goal): Goal | null {
  const i = GOAL_OPTIONS.findIndex(o => o.value === goal)
  return i >= 0 && i < GOAL_OPTIONS.length - 1 ? GOAL_OPTIONS[i + 1].value : null
}

// ── Time budget ──────────────────────────────────────────────────────

export type Commitment = 'light' | 'casual' | 'regular' | 'heavy'

export interface CommitmentOption {
  value: Commitment
  labelKey: string
  /** The weekly target this answer becomes, and the number its hint quotes. */
  sessionsPerWeek: number
}

/**
 * Stated in sessions, not hours.
 *
 * The first version stored minutes per week and divided by the length of a
 * session, which produced targets nobody would recognise from the label they
 * picked: "a couple of sessions a week" became a target of 15, and "as much as
 * it takes" became 75 — eleven drills a day. Deriving the visible number from a
 * unit the learner never chose is how a label and its consequence drift apart.
 *
 * Sessions are what the app counts, so sessions are what it asks for.
 */
export const COMMITMENT_OPTIONS: CommitmentOption[] = [
  // The hint is derived from `sessionsPerWeek` rather than written beside it:
  // the two used to be separate edits, and a pace that says one number while
  // the plan counts another is worse than no hint.
  { value: 'light', labelKey: 'profile.pace.light.label', sessionsPerWeek: 2 },
  { value: 'casual', labelKey: 'profile.pace.casual.label', sessionsPerWeek: 5 },
  { value: 'regular', labelKey: 'profile.pace.regular.label', sessionsPerWeek: 12 },
  { value: 'heavy', labelKey: 'profile.pace.heavy.label', sessionsPerWeek: 25 },
]

/**
 * A floor of one week per stage, regardless of how many hours are available.
 *
 * Not a fudge factor: making a count automatic is a spacing problem, not a
 * volume one. Ten drills in an afternoon does not produce the same recall as
 * ten drills over a fortnight, and an estimate that ignores that would promise
 * something the learner cannot actually achieve.
 */
export const MIN_WEEKS_PER_STAGE = 1

export function sessionsPerWeek(commitment: Commitment): number {
  return COMMITMENT_OPTIONS.find(o => o.value === commitment)?.sessionsPerWeek ?? 5
}

// ── Estimate ─────────────────────────────────────────────────────────

export interface Estimate {
  /** Stages between here and the goal, inclusive. */
  stages: number
  /** Qualifying drill sessions those stages require. */
  sessions: number
  /** A realistic number of weeks, floored by the spacing rule. */
  weeks: number
}

/**
 * How far it is from here to the goal.
 *
 * Counts only what the curriculum actually demands, so the number moves when
 * the curriculum does. Reading stages contribute no sessions — they take time,
 * but not the kind this estimate can measure honestly.
 *
 * Returns zero everything when the learner is already at or past their goal.
 */
export function estimateToGoal(from: StageId, goal: Goal, commitment: Commitment): Estimate {
  const start = stageIndex(from)
  const end = stageIndex(goalStage(goal))
  if (start > end) return { stages: 0, sessions: 0, weeks: 0 }

  const span = CURRICULUM.slice(start, end + 1)
  // What the curriculum demands, and nothing else.
  //
  // This used to be inflated for the arithmetic-heavy stages when the learner
  // told us they were slow at mental sums. That question is gone, and rather
  // than keep the multiplier on a guessed input, it goes too: a number nobody
  // supplied is an invented number wearing the costume of personalisation.
  const needed = (stage: (typeof CURRICULUM)[number]) => stage.drill?.minSessions ?? 0

  const sessions = span.reduce((n, s) => n + needed(s), 0)
  const perWeek = sessionsPerWeek(commitment)

  // Per stage, not over the whole span. A stage cannot be finished faster than
  // the spacing floor however many hours are free, but a learner with very
  // little time needs *more* than a week for one — and summing per stage is the
  // only way both of those come out right. Summed globally, the floor swallowed
  // the time budget entirely and the question would have been decoration.
  const weeks = span.reduce(
    (total, stage) => total + Math.max(MIN_WEEKS_PER_STAGE, Math.ceil(needed(stage) / perWeek)),
    0,
  )

  return { stages: span.length, sessions, weeks }
}

/** This week's target and how far along it the learner is. */
export interface Pace {
  /** Sessions the learner said they have time for each week. */
  target: number
  /** Sessions actually recorded since the start of this week. */
  done: number
  /** Whether the week's target has been met. */
  met: boolean
}

/**
 * Turn the time answer into a target the learner can actually see.
 *
 * The commitment question previously fed only a one-off estimate on the result
 * screen, which is a number you read once and forget. A weekly target is the
 * form that keeps working: it is checkable, it resets, and it is the same unit
 * the daily challenge deals in.
 *
 * `weekStart` is passed in rather than read from the clock so the caller owns
 * the notion of "this week" and the function stays pure.
 */
export function derivePace(
  commitment: Commitment,
  sessions: readonly { timestamp: string }[],
  weekStart: string,
): Pace {
  const target = sessionsPerWeek(commitment)
  const done = sessions.filter(s => s.timestamp.slice(0, 10) >= weekStart).length
  return { target, done, met: done >= target }
}

/** Whether a stage lies beyond what the learner said they wanted. */
export function isBeyondGoal(stage: StageId, goal: Goal): boolean {
  return stageIndex(stage) > stageIndex(goalStage(goal))
}

// ── Persistence ──────────────────────────────────────────────────────

const PROFILE_KEY = 'bjt_learner_profile'

/**
 * What the plan needs to know beyond where the learner starts.
 *
 * Down from five fields to two. Casino experience, mental arithmetic and "how
 * did you find us" were dropped with the questionnaire: the first two only fed
 * a result screen that no longer exists, and the third never fed anything at
 * all — it was analytics collected from someone who had not yet seen the
 * product.
 *
 * Neither survivor is asked up front any more. Both are derived from the single
 * starting-point answer and stay editable inside the plan, which is where they
 * were editable before as well — asking a question whose answer is already
 * changeable one screen later is asking it twice.
 */
export interface LearnerProfile {
  goal: Goal
  commitment: Commitment
}

const isGoal = (v: unknown): v is Goal => GOAL_OPTIONS.some(o => o.value === v)
const isCommitment = (v: unknown): v is Commitment => COMMITMENT_OPTIONS.some(o => o.value === v)

/**
 * The starting profile for someone who has just picked their level.
 *
 * Deliberately the same for every level, and that is not an oversight.
 *
 * The goal decides where the path *ends*. Nothing in "I have never played"
 * says whether that person wants to understand counting or take it to a table,
 * so narrowing their path on their behalf would be a guess presented as a
 * setting — and the guess that costs most is the one that quietly hides the
 * later stages. The full path shows everything and closes nothing off.
 *
 * The pace is the middle option for the same reason. Both are one tap away in
 * the plan, and a learner who has done a few sessions has told us far more
 * about their real pace than a question ever could.
 */
export function profileForLevel(): LearnerProfile {
  return { goal: 'serious', commitment: 'casual' }
}

/**
 * The stored profile, or null if none has been written yet.
 *
 * Both fields are required. A profile from an older build carrying the three
 * dropped fields still loads — the extras are simply ignored — so nobody is
 * marched through anything again after an update.
 */
export function getProfile(): LearnerProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null

    const { goal, commitment } = parsed as Record<string, unknown>
    if (!isGoal(goal) || !isCommitment(commitment)) return null

    return { goal, commitment }
  } catch {
    return null
  }
}

export function setProfile(profile: LearnerProfile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  } catch {
    /* storage unavailable — the plan falls back to the full path */
  }
}
