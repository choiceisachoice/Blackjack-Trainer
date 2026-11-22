import { describe, it, expect } from 'vitest'
import {
  simulateCurve, levelFor, weekOfLevel, CURVE_SCENARIOS, BLOCK_QUESTIONS, TYPICAL_ACCURACY,
  type CurveResult,
} from './xp-curve'
import { LEVELS, DAILY_MODE_XP_CAP } from './level-system'
import { CURRICULUM } from './curriculum'
import { totalStageXP } from './stage-rewards'
import { WEEK_GOAL_XP } from './weekly-rewards'

/**
 * The level curve, read against three learners (21 Nov 2026).
 *
 * These tests pin what the simulation is — that it adds up, that it follows
 * the plan's own rules — and not what the numbers are: the numbers are the
 * finding, written down in `docs/XP-CURVE-2026-11.md`, and they are meant to
 * move when an XP source is changed.
 *
 * To print the table again after such a change:
 *
 *   XP_CURVE_OUT=curve.md npx vitest run src/services/xp-curve.test.ts
 */
const HORIZON = 156 // three years

const results = new Map<string, { core: CurveResult; withChallenges: CurveResult }>()
function run(name: string) {
  let r = results.get(name)
  if (!r) {
    const s = CURVE_SCENARIOS.find(x => x.name === name)!
    r = {
      core: simulateCurve({ budget: s.budget, weeks: HORIZON }),
      withChallenges: simulateCurve({ budget: s.budget, weeks: HORIZON, challenges: s.challenges }),
    }
    results.set(name, r)
  }
  return r
}

describe('levelFor', () => {
  it('is the highest level whose requirement the total meets', () => {
    expect(levelFor(0)).toBe(1)
    expect(levelFor(49)).toBe(1)
    expect(levelFor(50)).toBe(2)
    expect(levelFor(210_000)).toBe(25)
    expect(levelFor(9_999_999)).toBe(25)
  })
})

describe('simulateCurve', () => {
  it('is deterministic', () => {
    const budget = { daysPerWeek: 3, minutesPerDay: 20 } as const
    expect(simulateCurve({ budget, weeks: 30 })).toEqual(simulateCurve({ budget, weeks: 30 }))
  })

  it('adds up: the weeks are the total, and the total is its sources', () => {
    for (const s of CURVE_SCENARIOS) {
      const r = run(s.name).withChallenges
      const b = r.bySource
      expect(r.weekly.reduce((a, x) => a + x, 0)).toBe(r.totalXP)
      expect(b.sessions + b.personalBests + b.stages + b.weekGoals + b.weekStreaks + b.challenges).toBe(r.totalXP)
      expect(r.cumulative[r.cumulative.length - 1]).toBe(r.totalXP)
    }
  })

  it('levels are reached in order and never lost', () => {
    for (const s of CURVE_SCENARIOS) {
      const weeks = run(s.name).core.levelWeek.filter((w): w is number => w !== null)
      expect(weeks[0]).toBe(1)
      for (let i = 1; i < weeks.length; i++) expect(weeks[i]).toBeGreaterThanOrEqual(weeks[i - 1])
      const { cumulative } = run(s.name).core
      for (let i = 1; i < cumulative.length; i++) expect(cumulative[i]).toBeGreaterThanOrEqual(cumulative[i - 1])
    }
  })

  it('the plan is finished, pays every stage once, and takes longer with less time', () => {
    const [light, casual, heavy] = CURVE_SCENARIOS.map(s => run(s.name).core)
    for (const r of [light, casual, heavy]) {
      expect(r.planWeek).not.toBeNull()
      expect(r.bySource.stages).toBe(totalStageXP())
    }
    expect(heavy.planWeek!).toBeLessThan(casual.planWeek!)
    expect(casual.planWeek!).toBeLessThan(light.planWeek!)
    // No budget finishes the road faster than its days rule allows.
    const minDays = CURRICULUM.reduce((n, s) => n + (s.drill?.minDays ?? 0), 0)
    for (const [r, s] of [[light, 1], [casual, 3], [heavy, 7]] as const) {
      expect(r.planWeek!).toBeGreaterThanOrEqual(Math.ceil(minDays / s))
    }
  })

  it('a kept week is paid every week, and a mode never more than its day limit', () => {
    for (const s of CURVE_SCENARIOS) {
      const r = run(s.name).core
      expect(r.bySource.weekGoals).toBe(r.weekly.length * WEEK_GOAL_XP)
      // 2 / 4 / 8 / 12 weeks, once: the learner never misses a week.
      expect(r.bySource.weekStreaks).toBe(50 + 100 + 200 + 400)
      const modes = 5
      const ceiling = s.budget.daysPerWeek * modes * DAILY_MODE_XP_CAP
      const sessionsPerWeek = r.bySource.sessions / r.weekly.length
      expect(sessionsPerWeek).toBeLessThanOrEqual(ceiling)
    }
  })

  it('challenges only add', () => {
    for (const s of CURVE_SCENARIOS) {
      const { core, withChallenges } = run(s.name)
      expect(core.bySource.challenges).toBe(0)
      expect(withChallenges.totalXP).toBeGreaterThan(core.totalXP - 1)
      expect(withChallenges.bySource.challenges).toBeGreaterThan(0)
    }
  })

  it('projects a level beyond the horizon instead of leaving it blank', () => {
    const light = run('1 day × 10 min').core
    const top = weekOfLevel(light, 25)
    expect(top.projected).toBe(true)
    expect(top.week!).toBeGreaterThan(HORIZON)
    expect(weekOfLevel(light, 1)).toEqual({ week: 1, projected: false })
  })

  it('uses the drills at their default size and the stated accuracy', () => {
    expect(TYPICAL_ACCURACY).toBe(0.8)
    expect(BLOCK_QUESTIONS.deviationFlashCards).toBe(20)
    expect(BLOCK_QUESTIONS.speedDrill).toBe(5)
  })
})

/** The table for the document. Written only when asked for. */
describe('the table', () => {
  it('can be printed', async () => {
    const out = process.env.XP_CURVE_OUT
    const lines: string[] = []
    const cell = (r: CurveResult, level: number) => {
      const { week, projected } = weekOfLevel(r, level)
      return week === null ? '—' : projected ? `~${week}` : String(week)
    }
    const names = CURVE_SCENARIOS.map(s => s.name)
    lines.push('## Summary', '')
    lines.push(`| | ${names.join(' | ')} |`, `|---|${names.map(() => '---:').join('|')}|`)
    const row = (label: string, f: (r: { core: CurveResult; withChallenges: CurveResult }) => string | number | null) =>
      lines.push(`| ${label} | ${names.map(n => f(run(n)) ?? '—').join(' | ')} |`)
    row('XP per week while on the plan (core)', r => r.core.weeklyDuringPlan)
    row('XP per week after the plan (core)', r => r.core.weeklyAfterPlan)
    row('XP per week after the plan (with challenges)', r => r.withChallenges.weeklyAfterPlan)
    row('Plan finished in week', r => r.core.planWeek)
    row('Level when the plan is finished (core)', r => r.core.planLevel)
    row('XP when the plan is finished (core)', r => r.core.planXP)
    row('Level when the plan is finished (with challenges)', r => r.withChallenges.planLevel)
    row('Sessions XP (whole run, core)', r => r.core.bySource.sessions)
    row('Personal bests', r => r.core.bySource.personalBests)
    row('Stages', r => r.core.bySource.stages)
    row('Week goals', r => r.core.bySource.weekGoals)
    row('Week streaks', r => r.core.bySource.weekStreaks)
    row('Challenges (assumed habit)', r => r.withChallenges.bySource.challenges)
    row('Weeks simulated', r => r.core.weekly.length)
    lines.push('', '## Week in which each level is reached', '')
    lines.push(`| Level | XP | ${names.map(n => `${n} core | + challenges`).join(' | ')} |`)
    lines.push(`|---:|---:|${names.map(() => '---:|---:').join('|')}|`)
    for (const l of LEVELS) {
      lines.push(`| ${l.level} | ${l.xpRequired.toLocaleString('en')} | ${names.map(n => `${cell(run(n).core, l.level)} | ${cell(run(n).withChallenges, l.level)}`).join(' | ')} |`)
    }
    expect(lines.length).toBeGreaterThan(LEVELS.length)
    if (out) {
      const fs = await import('node:fs')
      fs.writeFileSync(out, lines.join('\n') + '\n')
    }
  })
})
