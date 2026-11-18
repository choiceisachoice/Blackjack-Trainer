import type { AppMode } from '../store/app-store'
import type { TrainingSessionResult } from './stats-types'
import {
  currentStage,
  nextUnlockedStage,
  stageIndex,
  type StageId,
  type StageProgress,
} from './curriculum'
import { BLOCK_MINUTES, goalStage, type Goal, type TimeBudget } from './learner-profile'
import { dayKey } from './date-utils'

/**
 * Today's training, cut to the time the learner said they have.
 *
 * The plan used to be a list of seven stages with one button: "start
 * drilling". It said what the stage was and never what to do *today* — the
 * same screen for someone with ten minutes on a Sunday and someone with an
 * hour every evening, and the same drill until the stage closed (Darius,
 * 17 Nov 2026: "billig und unlogisch").
 *
 * A training day is now a short list of blocks:
 *
 *  - **warm-up** — one run of a stage already behind you, the one you have not
 *    touched for longest. Skills this plan builds on decay, and a different
 *    old stage comes round each day.
 *  - **today's work** — the stage you are on, as many runs as the time allows.
 *  - **the table** — for Pro, once counting is in place: a Casino Session,
 *    where everything learned so far has to work at once.
 *
 * What the day holds depends on the minutes; how many such days a week is the
 * learner's other answer. The bar of a stage does **not** depend on either —
 * it is the same for everyone, and so is the XP. Less time means the same road
 * takes longer, never that it is made shorter.
 *
 * Pure: everything it needs is passed in, including what day it is.
 */

/** What a block asks for. */
export type BlockKind = 'read' | 'warmup' | 'work' | 'table'

export interface PlanBlock {
  /** Stable within one day's plan, for keys and tests. */
  id: string
  kind: BlockKind
  stage: StageId
  /** The screen the block is done on. */
  mode: AppMode
  minutes: number
  /** A session recorded today already covers this block. */
  done: boolean
}

export interface DayPlan {
  blocks: PlanBlock[]
  /** Minutes the blocks add up to. */
  minutes: number
  doneMinutes: number
  /** Every block is done. */
  complete: boolean
  /** The first block still open, or null when the day is complete. */
  next: PlanBlock | null
  /** The stage the day's work belongs to; null once the goal is reached. */
  focus: StageId | null
  /**
   * The stage the learner is on is behind the paywall and the day was built
   * around what is open instead. The screen says so.
   */
  lockedFocus: StageId | null
}

/** A Casino Session is three blocks long: a shoe is not played in five minutes. */
const TABLE_MINUTES = 15
/** Stages whose skills the table needs before it is worth sitting down. */
const TABLE_AFTER: StageId = 'hi-lo'

export interface DayPlanInput {
  progress: readonly StageProgress[]
  placement: StageId
  goal: Goal
  isPro: boolean
  budget: TimeBudget
  sessions: readonly TrainingSessionResult[]
  /** The day being planned, as `YYYY-MM-DD`. */
  today: string
  /**
   * Stages whose reading the learner has opened or ticked. A stage read once
   * is not put on the day again just because its drill has not been tried.
   */
  readStages?: readonly StageId[]
}

/**
 * How the minutes of one training day are divided.
 *
 * One slot in three goes to the warm-up, because recall is what fades; the
 * table takes its three slots only from a day long enough to leave real work
 * beside it.
 *
 * @param minutes - Length of the training day
 * @param withTable - Whether a Casino Session belongs in it
 * @param hasReview - Whether there is any earlier stage to warm up on
 */
export function divideDay(
  minutes: number,
  withTable: boolean,
  hasReview: boolean,
): { work: number; warmup: number; table: number } {
  const slots = Math.max(1, Math.floor(minutes / BLOCK_MINUTES))
  const table = withTable && slots >= 6 ? 1 : 0
  const rest = slots - table * (TABLE_MINUTES / BLOCK_MINUTES)
  const warmup = hasReview ? Math.floor(rest / 3) : 0
  return { work: rest - warmup, warmup, table }
}

/** When each drill stage was last practised, newest timestamp per stage. */
function lastPractised(
  progress: readonly StageProgress[],
  sessions: readonly TrainingSessionResult[],
): Map<StageId, string> {
  const last = new Map<StageId, string>()
  for (const p of progress) {
    const drill = p.stage.drill
    if (!drill) continue
    let newest = ''
    for (const s of sessions) if (drill.counts(s) && s.timestamp > newest) newest = s.timestamp
    if (newest) last.set(p.stage.id, newest)
  }
  return last
}

/**
 * Build the plan for one day.
 *
 * @param input - Where the learner stands, what they want, and how much time there is
 */
export function buildDayPlan(input: DayPlanInput): DayPlan {
  const { progress, placement, goal, isPro, budget, sessions, today, readStages = [] } = input
  const goalIndex = stageIndex(goalStage(goal))

  const current = currentStage(progress, placement)
  const inGoal = current && stageIndex(current.stage.id) <= goalIndex ? current : null
  const lockedFocus = inGoal?.locked ? inGoal.stage.id : null
  // Behind the paywall: work on the next stage that is open, if there is one.
  const focus = inGoal?.locked
    ? nextUnlockedStage(progress, placement, goalStage(goal))
    : inGoal
  // With nothing on turn the goal is reached: the pool is the road walked,
  // and never a stage beyond the goal that was not asked for.
  const focusIndex = focus ? stageIndex(focus.stage.id) : goalIndex + 1

  // Earlier stages with a drill this learner can open — the warm-up pool,
  // least recently practised first. Never-practised sorts to the front: a
  // stage skipped by the placement is exactly the one worth checking.
  // Ordered by practice *before* today. Counting today's runs re-sorted the
  // pool the moment the warm-up was done: the plan then asked for the next
  // stage's warm-up instead of ticking this one, and a day was never finished.
  const last = lastPractised(progress, sessions.filter(s => dayKey(s.timestamp) < today))
  const pool = progress
    .filter(p => p.stage.drill && !p.locked && p.stage.drill.mode !== 'casinoSession')
    .filter(p => stageIndex(p.stage.id) < focusIndex)
    .sort((a, b) => (last.get(a.stage.id) ?? '').localeCompare(last.get(b.stage.id) ?? ''))

  const focusIsTable = focus?.stage.drill?.mode === 'casinoSession'
  const tableOpen = isPro
    && !focusIsTable
    && focusIndex > stageIndex(TABLE_AFTER)
  const split = divideDay(budget.minutesPerDay, tableOpen, pool.length > 0)

  const blocks: Omit<PlanBlock, 'done'>[] = []
  const add = (kind: BlockKind, p: StageProgress, mode: AppMode, minutes: number) => {
    blocks.push({ id: `${kind}-${p.stage.id}-${blocks.length}`, kind, stage: p.stage.id, mode, minutes })
  }

  // 1. The warm-up comes first: it is short, it is familiar, and it is what a
  //    cold start is for.
  if (pool.length > 0 && split.warmup > 0) {
    add('warmup', pool[0], pool[0].stage.drill!.mode, BLOCK_MINUTES)
  }

  // 2. Today's work.
  let work = split.work
  if (focus) {
    const drill = focus.stage.drill
    // Reading before the first run of a stage, and instead of a run where the
    // stage is reading only.
    const alreadyRead = !focus.readOnly && readStages.includes(focus.stage.id)
    if (focus.stage.read && !alreadyRead && (focus.readOnly || focus.attempts === 0)) {
      add('read', focus, focus.stage.read.mode, BLOCK_MINUTES)
      work -= 1
    }
    if (drill) {
      if (focusIsTable) {
        // A day shorter than a full sit still gets the table — for as long
        // as the day is. A ten-minute day used to be handed fifteen minutes.
        const minutes = work * BLOCK_MINUTES
        const sits = Math.max(1, Math.floor(minutes / TABLE_MINUTES))
        for (let i = 0; i < sits; i++) add('table', focus, drill.mode, Math.min(TABLE_MINUTES, Math.max(BLOCK_MINUTES, minutes)))
        work = 0
      } else {
        for (let i = 0; i < Math.max(work, focus.readOnly ? 0 : 1); i++) {
          add('work', focus, drill.mode, BLOCK_MINUTES)
        }
        work = 0
      }
    }
  }

  // 3. The rest of the warm-up slots, and any work slots nothing claimed (the
  //    goal is reached, or the stage on turn is reading only): keep the older
  //    stages sharp, a different one each.
  //    With a single earlier stage there is nothing to rotate through, and a
  //    second run of it would be the same row twice: the stage on turn gets
  //    those minutes instead.
  const spare = Math.max(0, split.warmup - 1) + Math.max(0, work)
  for (let i = 0; i < spare; i++) {
    if (pool.length > 1) {
      const p = pool[(i + 1) % pool.length]
      add('warmup', p, p.stage.drill!.mode, BLOCK_MINUTES)
    } else if (focus?.stage.drill && !focusIsTable) {
      add('work', focus, focus.stage.drill.mode, BLOCK_MINUTES)
    } else if (pool.length === 1) {
      add('warmup', pool[0], pool[0].stage.drill!.mode, BLOCK_MINUTES)
    }
  }

  // 4. The table, last: it uses everything above.
  if (split.table > 0) {
    const table = progress.find(p => p.stage.drill?.mode === 'casinoSession')
    if (table) add('table', table, 'casinoSession', TABLE_MINUTES)
  }

  // A session recorded today covers one block that asks for it — each session
  // once, so two flashcard blocks need two flashcard sessions.
  const todays = sessions.filter(s => dayKey(s.timestamp) === today)
  const used = new Set<string>()
  const byStage = new Map(progress.map(p => [p.stage.id, p]))
  const marked: PlanBlock[] = blocks.map(b => {
    if (b.kind === 'read') {
      const p = byStage.get(b.stage)
      return { ...b, done: p ? (p.readOnly ? p.done : p.attempts > 0) : false }
    }
    const counts = byStage.get(b.stage)?.stage.drill?.counts
    const hit = counts ? todays.find(s => !used.has(s.id) && counts(s)) : undefined
    if (hit) used.add(hit.id)
    return { ...b, done: Boolean(hit) }
  })

  const minutes = marked.reduce((n, b) => n + b.minutes, 0)
  const doneMinutes = marked.filter(b => b.done).reduce((n, b) => n + b.minutes, 0)
  const next = marked.find(b => !b.done) ?? null

  return {
    blocks: marked,
    minutes,
    doneMinutes,
    complete: marked.length > 0 && next === null,
    next,
    focus: focus?.stage.id ?? null,
    lockedFocus,
  }
}

/** The week so far, against the days the learner planned for. */
export interface WeekPlan {
  /** Training days planned for the week. */
  target: number
  /** Different days trained since the week began. */
  trained: number
  met: boolean
  /** Monday to Sunday: whether each day has a session. */
  days: boolean[]
  /** Index of today in `days`. */
  todayIndex: number
}

/**
 * This week's training days.
 *
 * Counted in days, not sessions: "three evenings a week" is what a person can
 * promise and keep, and it is the unit the spacing rule of every stage is
 * written in.
 *
 * @param sessions - Recorded sessions
 * @param budget - The learner's time budget
 * @param weekStart - Day key of the week's Monday
 * @param today - Today's day key
 */
export function deriveWeek(
  sessions: readonly { timestamp: string }[],
  budget: TimeBudget,
  weekStart: string,
  today: string,
): WeekPlan {
  const start = new Date(`${weekStart}T12:00:00`)
  const keys = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return dayKey(d)
  })
  const trainedDays = new Set(sessions.map(s => dayKey(s.timestamp)))
  const days = keys.map(k => trainedDays.has(k))
  const trained = days.filter(Boolean).length
  return {
    target: budget.daysPerWeek,
    trained,
    met: trained >= budget.daysPerWeek,
    days,
    todayIndex: Math.max(0, keys.indexOf(today)),
  }
}

/**
 * How many weeks the road to the goal still takes at this budget.
 *
 * Each open stage needs its remaining good sessions *and* its remaining
 * different days; whichever is more decides how many training days it costs.
 * An honest lower bound — it assumes every run clears the bar — so it is
 * shown as "about", and it shrinks only by training.
 *
 * @returns Whole weeks, or 0 when the goal is reached
 */
export function weeksToGoal(
  progress: readonly StageProgress[],
  placement: StageId,
  goal: Goal,
  budget: TimeBudget,
): number {
  const from = stageIndex(placement)
  const to = stageIndex(goalStage(goal))
  const perDay = divideDay(budget.minutesPerDay, false, true).work
  let trainingDays = 0
  for (const p of progress.slice(from, to + 1)) {
    if (p.done || p.readOnly) continue
    // Not every run clears the bar: two in three is what the estimate allows
    // for. Without it the days rule decided alone, and ten minutes a day and
    // sixty promised the same date.
    const bySessions = Math.ceil(((p.target - p.current) * 1.5) / Math.max(1, perDay))
    trainingDays += Math.max(bySessions, p.targetDays - p.days, 1)
  }
  return Math.ceil(trainingDays / Math.max(1, budget.daysPerWeek))
}
