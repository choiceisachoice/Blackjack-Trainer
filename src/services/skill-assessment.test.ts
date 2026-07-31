import { describe, it, expect } from 'vitest'
import {
  ENTRY_OPTIONS,
  CHECKED_STAGES,
  TERMINAL_STAGE,
  buildChecks,
  startProbe,
  nextCheck,
  recordAnswer,
  resolvePlacement,
  placeFromAnswers,
  type CheckQuestion,
  type ProbeState,
} from './skill-assessment'
import { CURRICULUM, stageIndex } from './curriculum'
import { Action, DEFAULT_RULES } from '../engine/rules/types'
import { getOptimalAction } from '../engine/strategy/basic-strategy'
import { getDeviationAction, ILLUSTRIOUS_18 } from '../engine/counting/deviations'
import { getCountValue, getSystemById } from '../engine/counting/counting-systems'
import { CountingSystemId } from '../engine/counting/types'
import { isBust } from '../engine/rules/hand-utils'

const CHECKS = buildChecks()

/** Drive a whole assessment, deciding each answer with the given policy. */
function run(entry: string, answer: (c: CheckQuestion) => string): ProbeState {
  const option = ENTRY_OPTIONS.find(o => o.value === entry)!
  let state = startProbe(option.stage)
  let check = nextCheck(state, CHECKS)
  // Bound the loop so a broken search fails loudly instead of hanging.
  for (let i = 0; check && i < 20; i++) {
    state = recordAnswer(state, check, answer(check))
    check = nextCheck(state, CHECKS)
  }
  return state
}

const allRight = (c: CheckQuestion) => c.correct
const allWrong = (c: CheckQuestion) => c.options.find(o => o !== c.correct)!

describe('the checks', () => {
  it('covers every stage except the terminal one, in curriculum order', () => {
    expect(CHECKS.map(c => c.stage)).toEqual(CHECKED_STAGES)
    expect([...CHECKED_STAGES, TERMINAL_STAGE]).toEqual(CURRICULUM.map(s => s.id))
  })

  it('always offers its own correct answer as an option', () => {
    // The previous version wrote '−1' (U+2212) into the options and computed
    // '-1' (ASCII) as the answer — a mismatch nobody could ever get right.
    for (const c of CHECKS) {
      expect(c.options, c.stage).toContain(c.correct)
    }
  })

  it('offers distinct options and no duplicates', () => {
    for (const c of CHECKS) {
      expect(new Set(c.options).size, c.stage).toBe(c.options.length)
      expect(c.options.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('explains every check', () => {
    for (const c of CHECKS) {
      expect(c.explanation.length, c.stage).toBeGreaterThan(60)
      expect(c.prompt.length, c.stage).toBeGreaterThan(0)
    }
  })

  it('takes its answers from the engines, not from a written key', () => {
    const byStage = (s: string) => CHECKS.find(c => c.stage === s)!

    // rules — the drawn hand really is a bust
    expect(isBust(byStage('rules').hand!.player)).toBe(true)

    // basic strategy — soft 18 vs 9
    const bs = byStage('basic-strategy')
    expect(bs.correct).toBe(getOptimalAction(bs.hand!.player, bs.hand!.dealer, DEFAULT_RULES))

    // hi-lo — the running count of the shown sequence
    const hiLo = byStage('hi-lo')
    const system = getSystemById(CountingSystemId.HiLo)
    const sum = hiLo.sequence!.cards.reduce((n, c) => n + getCountValue(c, system), 0)
    expect(hiLo.correct).toBe(sum > 0 ? `+${sum}` : `${sum}`)

    // deviations — the Illustrious 18 entry, and it must differ from the chart
    const dev = byStage('deviations')
    const basic = getOptimalAction(dev.hand!.player, dev.hand!.dealer, DEFAULT_RULES)
    expect(dev.correct).toBe(getDeviationAction(dev.hand!.player, dev.hand!.dealer, 1, ILLUSTRIOUS_18))
    expect(dev.correct).not.toBe(basic) // otherwise it tests nothing about deviations
  })

  it('shows the deviation question as a real hand with a count', () => {
    const dev = CHECKS.find(c => c.stage === 'deviations')!
    expect(dev.hand?.player).toHaveLength(2)
    expect(dev.count).toBeDefined()
    expect(dev.correct).toBe(Action.Stand)
  })
})

describe('the adaptive search', () => {
  it('opens by verifying the last stage the learner claims, not the first one they disclaim', () => {
    // "I play basic strategy" must be met with a basic-strategy hand, not with
    // a counting question they just said they cannot do.
    for (const option of ENTRY_OPTIONS) {
      if (option.stage === 'rules') continue // claims nothing; see below
      const first = nextCheck(startProbe(option.stage), CHECKS)!
      expect(stageIndex(first.stage), option.value).toBe(stageIndex(option.stage) - 1)
    }
  })

  it('gives every entry option a different opening question', () => {
    // The bug this rewrite exists for: two options used to open on the rules
    // question, so the first thing a beginner saw was the same either way.
    const openings = ENTRY_OPTIONS.map(o => nextCheck(startProbe(o.stage), CHECKS)?.stage ?? null)
    expect(new Set(openings).size).toBe(openings.length)
  })

  it('asks a declared beginner nothing at all', () => {
    // Quizzing someone who just said they have never played only produces a
    // wrong answer and a worse first minute.
    const state = startProbe('rules')
    expect(nextCheck(state, CHECKS)).toBeNull()
    expect(resolvePlacement(state).stage).toBe('rules')
    expect(resolvePlacement(state).asked).toBe(0)
  })

  it('covers the whole ladder — one entry option per stage', () => {
    expect(ENTRY_OPTIONS.map(o => o.stage)).toEqual(CURRICULUM.map(s => s.id))
  })

  it('never opens with a question the learner has explicitly disclaimed', () => {
    for (const option of ENTRY_OPTIONS) {
      const first = nextCheck(startProbe(option.stage), CHECKS)
      if (!first) continue
      expect(stageIndex(first.stage), option.value).toBeLessThan(stageIndex(option.stage))
    }
  })

  it('never asks more than four questions', () => {
    // log2(6) + 1. A longer test is a test people abandon.
    for (const option of ENTRY_OPTIONS) {
      for (const policy of [allRight, allWrong]) {
        expect(run(option.value, policy).asked.length).toBeLessThanOrEqual(4)
      }
    }
  })

  it('confirms an honest learner without arguing', () => {
    // Claim holds, next stage does not — the placement is exactly what they
    // said, reached in two questions.
    for (const option of ENTRY_OPTIONS) {
      if (option.stage === 'rules' || option.stage === 'table') continue
      const state = run(option.value, c =>
        stageIndex(c.stage) < stageIndex(option.stage) ? c.correct : c.options.find(o => o !== c.correct)!)
      expect(resolvePlacement(state).stage, option.value).toBe(option.stage)
    }
  })

  it('never asks the same stage twice', () => {
    for (const option of ENTRY_OPTIONS) {
      const asked = run(option.value, c => (stageIndex(c.stage) % 2 === 0 ? c.correct : c.options[0])).asked
      expect(new Set(asked.map(a => a.stage)).size).toBe(asked.length)
    }
  })

  it('places a learner who clears everything at the final stage', () => {
    // Except the declared beginner, who is taken at their word and asked
    // nothing — see 'asks a declared beginner nothing at all'.
    for (const option of ENTRY_OPTIONS) {
      if (option.stage === 'rules') continue
      expect(resolvePlacement(run(option.value, allRight)).stage, option.value).toBe(TERMINAL_STAGE)
    }
  })

  it('places a learner who gets everything wrong at the very beginning', () => {
    for (const option of ENTRY_OPTIONS) {
      expect(resolvePlacement(run(option.value, allWrong)).stage, option.value).toBe('rules')
    }
  })

  it('never places anyone above a stage they failed', () => {
    // The property that matters: being sent too far ahead is what makes people
    // quit. Whatever the answers, the placement sits at or below every failure.
    for (const option of ENTRY_OPTIONS) {
      for (const seed of [0, 1, 2, 3, 4, 5]) {
        const state = run(option.value, c => (stageIndex(c.stage) <= seed ? c.correct : c.options.find(o => o !== c.correct)!))
        const placement = resolvePlacement(state)
        for (const a of state.asked) {
          if (!a.correct) {
            expect(stageIndex(placement.stage)).toBeLessThanOrEqual(stageIndex(a.stage))
          }
        }
      }
    }
  })

  it('never places anyone below a stage they proved', () => {
    for (const option of ENTRY_OPTIONS) {
      for (const seed of [0, 2, 4]) {
        const state = run(option.value, c => (stageIndex(c.stage) <= seed ? c.correct : c.options.find(o => o !== c.correct)!))
        const placement = resolvePlacement(state)
        for (const a of state.asked) {
          if (a.correct) {
            expect(stageIndex(placement.stage)).toBeGreaterThan(stageIndex(a.stage))
          }
        }
      }
    }
  })
})

describe('placement coverage — the regression this rewrite exists for', () => {
  /** Every answer pattern: each entry option × every right/wrong combination. */
  function everyOutcome() {
    const results: { entry: string; pattern: number; stage: string }[] = []
    for (const option of ENTRY_OPTIONS) {
      // A bitmask over the six checks decides right/wrong per stage.
      for (let mask = 0; mask < 64; mask++) {
        const state = run(option.value, c =>
          (mask >> stageIndex(c.stage)) & 1 ? c.correct : c.options.find(o => o !== c.correct)!,
        )
        results.push({ entry: option.value, pattern: mask, stage: resolvePlacement(state).stage })
      }
    }
    return results
  }

  it('can reach every single stage', () => {
    // The old chain reached deviations and bet-spread in 0.5% of cases and
    // three stages were effectively dead. Every stage must be reachable.
    const reached = new Set(everyOutcome().map(r => r.stage))
    expect([...reached].sort()).toEqual([...CURRICULUM.map(s => s.id)].sort())
  })

  it('spreads outcomes instead of collapsing onto two stages', () => {
    const outcomes = everyOutcome()
    const counts = new Map<string, number>()
    for (const r of outcomes) counts.set(r.stage, (counts.get(r.stage) ?? 0) + 1)

    // The old version put 85% on two stages. Nothing may dominate like that.
    const biggest = Math.max(...counts.values())
    expect(biggest / outcomes.length).toBeLessThan(0.4)
  })

  it('lets the answers override the self-report in both directions', () => {
    // Someone who undersells — claims only the rules, answers everything right.
    const modest = resolvePlacement(run('rules', allRight))
    expect(modest.stage).toBe(TERMINAL_STAGE)

    // ...and claiming the top but answering badly must land at the bottom.
    const overconfident = resolvePlacement(run('table', allWrong))
    expect(overconfident.stage).toBe('rules')
  })

  it('lets the answers, not the self-report, decide the outcome', () => {
    // The old version had 15 of 27 self-report combinations ignore the quiz
    // entirely. Every option that asks anything must be able to end elsewhere.
    for (const option of ENTRY_OPTIONS) {
      const stages = new Set(
        everyOutcome().filter(r => r.entry === option.value).map(r => r.stage),
      )
      if (option.stage === 'rules') {
        // The one exception, and it is a deliberate one: a declared beginner is
        // believed and never quizzed, so there is only one possible outcome.
        expect(stages, option.value).toEqual(new Set(['rules']))
      } else {
        expect(stages.size, option.value).toBeGreaterThan(1)
      }
    }
  })
})

describe('the result', () => {
  it('reports how many checks were asked and passed', () => {
    const state = run('strategy', allRight)
    const placement = resolvePlacement(state)
    expect(placement.asked).toBe(state.asked.length)
    expect(placement.correct).toBe(state.asked.length)
    expect(placement.proven).toEqual(state.asked.map(a => a.stage))
  })

  it('explains the placement in terms of what actually happened', () => {
    const placement = resolvePlacement(run('table', allWrong))
    expect(placement.reason).toMatch(/did not land/)
    expect(placement.reason.length).toBeGreaterThan(30)
  })

  it('reads back a stored set of answers identically', () => {
    const answers = [
      { stage: 'hi-lo' as const, chosen: CHECKS.find(c => c.stage === 'hi-lo')!.correct },
      { stage: 'deviations' as const, chosen: 'nonsense' },
    ]
    // Hi-Lo proven, deviations failed — true-count sits between them and was
    // never tested, so it must not be assumed. The gap is where you start.
    const placement = placeFromAnswers('hi-lo', answers, CHECKS)
    expect(placement.stage).toBe('true-count')
    expect(placement.correct).toBe(1)
    expect(placement.proven).toEqual(['hi-lo'])
  })

  it('ignores answers for stages that have no check', () => {
    const placement = placeFromAnswers('rules', [{ stage: 'table', chosen: 'whatever' }], CHECKS)
    expect(placement.asked).toBe(0)
    expect(placement.stage).toBe('rules')
  })
})
