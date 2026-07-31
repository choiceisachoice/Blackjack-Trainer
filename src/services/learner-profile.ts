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
  label: string
  hint: string
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
    label: 'I want to understand how card counting works',
    hint: 'Learn the game and the count properly. No pressure to take it further.',
    stage: 'true-count',
  },
  {
    value: 'stop-losing',
    label: 'I want to stop giving money away at the table',
    hint: 'Play every hand correctly and know when the deck is in your favour.',
    stage: 'deviations',
  },
  {
    value: 'profit',
    label: 'I want to win money counting cards',
    hint: 'Everything above, plus the bet sizing that turns an edge into money.',
    stage: 'bet-spread',
  },
  {
    value: 'serious',
    label: 'I want to do this seriously, long term',
    hint: 'The full path, ending with everything at once under real conditions.',
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
  label: string
  hint: string
  /** The weekly target this answer becomes. */
  sessionsPerWeek: number
}

/** Roughly how long one drill plus reviewing it takes. */
export const MINUTES_PER_SESSION = 8

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
  { value: 'light', label: 'A few minutes here and there', hint: 'About 2 sessions a week.', sessionsPerWeek: 2 },
  { value: 'casual', label: 'A couple of times a week', hint: 'About 5 sessions a week.', sessionsPerWeek: 5 },
  { value: 'regular', label: 'Most days', hint: 'About 12 sessions a week.', sessionsPerWeek: 12 },
  { value: 'heavy', label: 'Every day, properly', hint: 'About 25 sessions a week.', sessionsPerWeek: 25 },
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

// ── Table experience ─────────────────────────────────────────────────

export type CasinoExperience = 'never' | 'online' | 'real'

export interface ChoiceOption<T extends string> {
  value: T
  label: string
  hint: string
}

/**
 * Whether the learner has actually sat at a table.
 *
 * Everyone can answer it, which is the point — it belongs in the block a
 * beginner meets before any question about counting. It also decides whether
 * the app should be talking to someone who has real money at risk.
 */
export const CASINO_OPTIONS: ChoiceOption<CasinoExperience>[] = [
  { value: 'never', label: 'Never — I’ve only seen it in films', hint: 'No table time at all. That is a fine place to start.' },
  { value: 'online', label: 'Online or with friends', hint: 'You’ve played hands, just not in a casino.' },
  { value: 'real', label: 'Yes, in a real casino', hint: 'You know what the table feels like with money on it.' },
]

/** Whether this learner has money at risk today. */
export function playsForRealMoney(casino: CasinoExperience): boolean {
  return casino === 'real'
}

// ── Mental arithmetic ────────────────────────────────────────────────

export type MathsComfort = 'quick' | 'okay' | 'slow'

/**
 * How comfortable the learner is doing small sums under time pressure.
 *
 * Not a personality quiz: the true-count conversion is division done in your
 * head while a dealer waits, and it is the single stage where this makes a
 * measurable difference to how many repetitions someone needs.
 */
export const MATHS_OPTIONS: ChoiceOption<MathsComfort>[] = [
  { value: 'quick', label: 'Quick — small sums are automatic', hint: 'Dividing by three in your head is no trouble.' },
  { value: 'okay', label: 'Fine, given a second', hint: 'You get there, just not instantly.' },
  { value: 'slow', label: 'Honestly, not my strength', hint: 'We’ll allow more practice where the arithmetic bites.' },
]

/**
 * Extra repetitions the counting stages need for this learner.
 *
 * Applied only to the stages whose difficulty is arithmetic — the rules and
 * basic strategy are recall, not sums, so inflating those would be a made-up
 * number dressed as personalisation.
 */
export function mathsMultiplier(maths: MathsComfort): number {
  return maths === 'slow' ? 1.5 : maths === 'okay' ? 1.2 : 1
}

/** The stages whose difficulty is arithmetic rather than recall. */
const ARITHMETIC_STAGES: StageId[] = ['hi-lo', 'true-count', 'bet-spread']

// ── Where they came from ─────────────────────────────────────────────

export type Source = 'search' | 'video' | 'friend' | 'social' | 'other'

export const SOURCE_OPTIONS: ChoiceOption<Source>[] = [
  { value: 'search', label: 'I searched for it', hint: 'Google, or somewhere like it.' },
  { value: 'video', label: 'A video or a podcast', hint: 'YouTube, a stream, an episode.' },
  { value: 'friend', label: 'Someone told me about it', hint: 'A friend, a forum, a group chat.' },
  { value: 'social', label: 'Social media', hint: 'A post or an ad that caught your eye.' },
  { value: 'other', label: 'Somewhere else', hint: 'Or you’d rather not say.' },
]

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
export function estimateToGoal(
  from: StageId,
  goal: Goal,
  commitment: Commitment,
  maths: MathsComfort = 'quick',
): Estimate {
  const start = stageIndex(from)
  const end = stageIndex(goalStage(goal))
  if (start > end) return { stages: 0, sessions: 0, weeks: 0 }

  const span = CURRICULUM.slice(start, end + 1)
  // Arithmetic-heavy stages take more repetitions for someone who does not do
  // sums quickly. Recall stages are left alone — stretching those too would be
  // an invented number wearing the costume of personalisation.
  const needed = (stage: (typeof CURRICULUM)[number]) => {
    const base = stage.drill?.minSessions ?? 0
    return ARITHMETIC_STAGES.includes(stage.id)
      ? Math.ceil(base * mathsMultiplier(maths))
      : base
  }

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

export interface LearnerProfile {
  goal: Goal
  commitment: Commitment
  casino: CasinoExperience
  maths: MathsComfort
  source: Source
}

const oneOf = <T extends string>(options: ChoiceOption<T>[] | { value: T }[]) =>
  (v: unknown): v is T => options.some(o => o.value === v)

const isGoal = (v: unknown): v is Goal => GOAL_OPTIONS.some(o => o.value === v)
const isCommitment = (v: unknown): v is Commitment => COMMITMENT_OPTIONS.some(o => o.value === v)
const isCasino = oneOf(CASINO_OPTIONS)
const isMaths = oneOf(MATHS_OPTIONS)
const isSource = oneOf(SOURCE_OPTIONS)

/**
 * The stored profile, or null if the learner has not answered yet.
 *
 * Only the two answers that steer the plan — goal and commitment — are
 * required. The rest were added later and are filled with neutral defaults when
 * missing, so an account that answered the earlier, shorter questionnaire keeps
 * its plan instead of being marched through the whole thing again.
 */
export function getProfile(): LearnerProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null

    const { goal, commitment, casino, maths, source } = parsed as Record<string, unknown>
    if (!isGoal(goal) || !isCommitment(commitment)) return null

    return {
      goal,
      commitment,
      casino: isCasino(casino) ? casino : 'never',
      maths: isMaths(maths) ? maths : 'okay',
      source: isSource(source) ? source : 'other',
    }
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
