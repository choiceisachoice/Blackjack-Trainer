import { CURRICULUM, deriveCurriculum, stageIndex, type StageId } from './curriculum'
import { buildDayPlan } from './daily-plan'
import { dayKey, parseDayKey, shiftDayKey } from './date-utils'
import { goalStage, type TimeBudget } from './learner-profile'
import { LEVELS, personalBestXP, sessionXP } from './level-system'
import { stageXP } from './stage-rewards'
import type { TrainingMode, TrainingSessionResult } from './stats-types'
import { pendingWeeklyAwards } from './weekly-rewards'

/**
 * A learner who follows the plan, week after week — for reading the level
 * curve, not for the app. Nothing in the product imports this.
 *
 * The point of simulating rather than multiplying is that every number comes
 * from the code that pays it: the day is the one `buildDayPlan` hands out,
 * a stage is finished when `deriveCurriculum` says so, a session is worth
 * what `sessionXP` and `personalBestXP` return (day limit included), and the
 * week is paid by `pendingWeeklyAwards`. Change a rule and the table moves.
 *
 * What is assumed, because it is a person and not a rule:
 *
 *  - The learner does every block of every planned day and trains on exactly
 *    the planned days, spread over the week.
 *  - A block is one drill at its default size ({@link BLOCK_QUESTIONS}).
 *  - Accuracy averages 80 %. Where a stage's bar is above that, two runs in
 *    three clear it and the third falls short by as much as keeps the average
 *    — the same "two in three" the plan's own forecast uses (`weeksToGoal`).
 *  - Pro, placement at the start, goal at the end: the whole road.
 *  - Challenges are optional and stated per scenario; awards for achievements
 *    are left out (all of them together are about 8,400 XP, once).
 */

/** Questions in one block of each drill — the modes' own defaults. */
export const BLOCK_QUESTIONS: Record<TrainingMode, number> = {
  deviationFlashCards: 20,
  speedDrill: 5,        // five runs of twenty cards
  deckEstimation: 20,
  betSpread: 20,
  casinoSession: 40,    // decisions in a fifteen-minute sit
  tableCounting: 20,
  deviationAtTable: 20,
}

/** The accuracy a simulated learner averages. */
export const TYPICAL_ACCURACY = 0.8

/** How often a learner finishes challenges. An assumption, stated per scenario. */
export interface ChallengeHabit {
  /** One daily challenge finished every this many training days; 0 for never. */
  dailyEvery: number
  /** What that daily challenge pays. */
  dailyXP: number
  /** One weekly challenge finished every this many weeks; 0 for never. */
  weeklyEvery: number
  /** What that weekly challenge pays. */
  weeklyXP: number
}

export interface CurveInput {
  budget: TimeBudget
  /** Weeks to simulate at most. Stops early once the top level is reached. */
  weeks: number
  challenges?: ChallengeHabit
  /** Monday the learner starts on. */
  start?: string
}

/** Where the XP came from. */
export interface XpBySource {
  sessions: number
  personalBests: number
  stages: number
  weekGoals: number
  weekStreaks: number
  challenges: number
}

export interface CurveResult {
  /** XP earned in each simulated week. */
  weekly: number[]
  /** Total XP at the end of each week. */
  cumulative: number[]
  /** For each level (index 0 = level 1): the week it was reached, 1-based; null if not within the horizon. */
  levelWeek: (number | null)[]
  /** The week the plan's last stage was finished, 1-based; null if not within the horizon. */
  planWeek: number | null
  /** Level and XP at that moment. */
  planLevel: number | null
  planXP: number | null
  /** Mean XP a week while the plan is running, and after it. */
  weeklyDuringPlan: number
  weeklyAfterPlan: number
  bySource: XpBySource
  totalXP: number
}

const STAGE_MODE: Record<StageId, TrainingMode | null> = {
  rules: null,
  'basic-strategy': 'deviationFlashCards',
  'hi-lo': 'speedDrill',
  'true-count': 'deckEstimation',
  deviations: 'deviationFlashCards',
  'bet-spread': 'betSpread',
  table: 'casinoSession',
}

/** The level a total stands for. */
export function levelFor(xp: number): number {
  let level = 1
  for (const l of LEVELS) if (xp >= l.xpRequired) level = l.level
  return level
}

/**
 * Correct answers of the n-th run on a stage.
 *
 * At or below 80 % the bar is cleared every time at the typical accuracy.
 * Above it: two runs at the smallest score that clears, the third at whatever
 * brings the three back to 80 %.
 */
function correctFor(stage: StageId, run: number, questions: number): number {
  const bar = CURRICULUM[stageIndex(stage)].drill?.minAccuracy ?? 0
  const typical = Math.round(questions * TYPICAL_ACCURACY)
  if (bar <= TYPICAL_ACCURACY) return typical
  const clears = Math.ceil(bar * questions - 1e-9)
  const miss = Math.max(0, typical * 3 - clears * 2)
  return run % 3 === 2 ? miss : clears
}

/** The days of a week a learner with `n` planned days trains on, as offsets from Monday. */
function trainingDays(n: number): number[] {
  return Array.from({ length: n }, (_, i) => Math.floor((i * 7) / n))
}

/**
 * Follow the plan for a number of weeks and report what it paid.
 *
 * @param input - The budget, the horizon and the challenge habit
 */
export function simulateCurve(input: CurveInput): CurveResult {
  const { budget, weeks, challenges } = input
  const start = input.start ?? '2026-01-05'
  const goal = 'serious' as const
  const goalIndex = stageIndex(goalStage(goal))

  let sessions: TrainingSessionResult[] = []
  const readStages: StageId[] = ['rules']
  const claimedStages: StageId[] = []
  const claimedRewards: string[] = []
  const runs = new Map<StageId, number>()
  /** Per mode: the three best earlier sessions — all `personalBestXP` needs of the past. */
  const bestOf = new Map<TrainingMode, TrainingSessionResult[]>()
  const by: XpBySource = { sessions: 0, personalBests: 0, stages: 0, weekGoals: 0, weekStreaks: 0, challenges: 0 }
  const total = () => by.sessions + by.personalBests + by.stages + by.weekGoals + by.weekStreaks + by.challenges

  const weekly: number[] = []
  const cumulative: number[] = []
  const levelWeek: (number | null)[] = LEVELS.map(l => (l.xpRequired === 0 ? 1 : null))
  let planWeek: number | null = null
  let planLevel: number | null = null
  let planXP: number | null = null
  let trainedDays = 0
  let seq = 0

  const noteLevels = (week: number) => {
    const xp = total()
    LEVELS.forEach((l, i) => { if (levelWeek[i] === null && xp >= l.xpRequired) levelWeek[i] = week })
  }

  for (let w = 0; w < weeks; w++) {
    const monday = shiftDayKey(start, w * 7)
    const before = total()

    for (const offset of trainingDays(budget.daysPerWeek)) {
      const today = shiftDayKey(monday, offset)
      trainedDays++
      const progress = deriveCurriculum(sessions, readStages, true, claimedStages)
      const plan = buildDayPlan({ progress, placement: 'rules', goal, isPro: true, budget, sessions, today, readStages })
      const todays: TrainingSessionResult[] = []

      plan.blocks.forEach((block, i) => {
        if (block.kind === 'read') {
          if (!readStages.includes(block.stage)) readStages.push(block.stage)
          return
        }
        const mode = STAGE_MODE[block.stage]
        if (!mode) return
        const questions = BLOCK_QUESTIONS[mode]
        const run = runs.get(block.stage) ?? 0
        runs.set(block.stage, run + 1)
        const correct = correctFor(block.stage, run, questions)
        const at = parseDayKey(today)
        at.setMinutes(i * 6)
        const session = {
          id: `sim-${seq++}`,
          mode,
          timestamp: at.toISOString(),
          durationSeconds: block.minutes * 60,
          totalQuestions: questions,
          correctAnswers: correct,
          accuracy: correct / questions,
          bestStreak: 0,
          // The deviations stage counts flashcard sessions that asked deviations.
          details: block.stage === 'deviations' ? { type: 'deviationFlashCards', perDeviation: { x: {} } } : { type: mode },
        } as unknown as TrainingSessionResult

        by.sessions += sessionXP(session, todays).amount
        const sameMode = [...(bestOf.get(mode) ?? []), ...todays.filter(s => s.mode === mode)]
        by.personalBests += personalBestXP(session, sameMode)
        todays.push(session)
        sessions.push(session)
        noteLevels(w + 1)
      })

      // Yesterday's sessions become history for the personal best.
      for (const s of todays) {
        const kept = [...(bestOf.get(s.mode) ?? []), s].sort((a, b) => b.accuracy - a.accuracy).slice(0, 3)
        bestOf.set(s.mode, kept)
      }

      // What the app's effect pays once the day's sessions are in.
      for (const p of deriveCurriculum(sessions, readStages, true, claimedStages)) {
        if (!p.done || claimedStages.includes(p.stage.id)) continue
        claimedStages.push(p.stage.id)
        by.stages += stageXP(p.stage.id)
      }
      for (const award of pendingWeeklyAwards({ sessions, daysPerWeek: budget.daysPerWeek, today, claimed: claimedRewards })) {
        claimedRewards.push(award.key)
        if (award.kind === 'week') by.weekGoals += award.xp
        else by.weekStreaks += award.xp
      }
      if (challenges && challenges.dailyEvery > 0 && trainedDays % challenges.dailyEvery === 0) {
        by.challenges += challenges.dailyXP
      }
      noteLevels(w + 1)

      if (planWeek === null && CURRICULUM.slice(0, goalIndex + 1).every(s => !s.drill || claimedStages.includes(s.id))) {
        planWeek = w + 1
        planXP = total()
        planLevel = levelFor(planXP)
      }
      // Nothing above looks further back than two weeks once a stage is paid;
      // a finished plan needs no more history than that.
      if (planWeek !== null) {
        const cutoff = shiftDayKey(today, -21)
        sessions = sessions.filter(s => dayKey(s.timestamp) >= cutoff)
      }
    }

    if (challenges && challenges.weeklyEvery > 0 && (w + 1) % challenges.weeklyEvery === 0) {
      by.challenges += challenges.weeklyXP
    }
    noteLevels(w + 1)
    weekly.push(total() - before)
    cumulative.push(total())
    if (total() >= LEVELS[LEVELS.length - 1].xpRequired) break
  }

  const mean = (list: number[]) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0)
  const split = planWeek ?? weekly.length
  return {
    weekly,
    cumulative,
    levelWeek,
    planWeek,
    planLevel,
    planXP,
    weeklyDuringPlan: Math.round(mean(weekly.slice(0, split))),
    weeklyAfterPlan: Math.round(mean(weekly.slice(split))),
    bySource: by,
    totalXP: total(),
  }
}

/** The three learners the curve is read against. */
export const CURVE_SCENARIOS: { name: string; budget: TimeBudget; challenges: ChallengeHabit }[] = [
  {
    name: '1 day × 10 min',
    budget: { daysPerWeek: 1, minutesPerDay: 10 },
    // An easy daily every fourth training day; a weekly asks for more than one sitting.
    challenges: { dailyEvery: 4, dailyXP: 50, weeklyEvery: 0, weeklyXP: 0 },
  },
  {
    name: '3 days × 20 min',
    budget: { daysPerWeek: 3, minutesPerDay: 20 },
    challenges: { dailyEvery: 2, dailyXP: 100, weeklyEvery: 2, weeklyXP: 300 },
  },
  {
    name: '7 days × 60 min',
    budget: { daysPerWeek: 7, minutesPerDay: 60 },
    challenges: { dailyEvery: 1, dailyXP: 100, weeklyEvery: 1, weeklyXP: 500 },
  },
]

/**
 * The week a level is reached, carried past the simulated horizon at the
 * pace of the last simulated weeks. For the table: "week 412" says more than
 * "not within three years".
 *
 * @returns The week, and whether it was simulated or projected
 */
export function weekOfLevel(result: CurveResult, level: number): { week: number | null; projected: boolean } {
  const simulated = result.levelWeek[level - 1]
  if (simulated != null) return { week: simulated, projected: false }
  const tail = result.weekly.slice(-12)
  const pace = tail.reduce((a, b) => a + b, 0) / Math.max(1, tail.length)
  if (pace <= 0) return { week: null, projected: true }
  const missing = LEVELS[level - 1].xpRequired - result.totalXP
  return { week: result.weekly.length + Math.ceil(missing / pace), projected: true }
}
