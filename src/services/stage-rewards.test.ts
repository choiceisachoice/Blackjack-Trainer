import { describe, it, expect, beforeEach } from 'vitest'
import {
  stageXP,
  getClaimedStages,
  markStageClaimed,
  pendingStageAwards,
  totalStageXP,
  STAGE_XP_BASE,
  STAGE_XP_STEP,
} from './stage-rewards'
import { CURRICULUM, stageIndex, type StageProgress } from './curriculum'
import { XP_REWARDS } from './level-system'

const progressFor = (done: string[]): StageProgress[] =>
  CURRICULUM.map(stage => ({
    stage,
    current: done.includes(stage.id) ? 3 : 0,
    target: 3,
    done: done.includes(stage.id),
    readOnly: !stage.drill,
    locked: false,
    attempts: 0,
    best: null,
    bar: Math.round((stage.drill?.minAccuracy ?? 0) * 100),
  }))

beforeEach(() => {
  localStorage.clear()
})

describe('stageXP', () => {
  const drilled = CURRICULUM.filter(s => s.drill)

  it('pays nothing for a stage the app cannot verify', () => {
    // "Mark as read" is an honesty checkbox, not an achievement. Paying it 150
    // XP levelled a brand-new account up twice on its very first click — level
    // 2 needs 50 XP, level 3 needs 200 — before it had done anything at all.
    for (const s of CURRICULUM.filter(s => !s.drill)) {
      expect(stageXP(s.id), s.id).toBe(0)
    }
    expect(stageXP('rules')).toBe(0)
  })

  it('grows with depth across the stages that are measured', () => {
    const values = drilled.map(s => stageXP(s.id))
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1])
    }
  })

  it('steps evenly by curriculum position', () => {
    expect(stageXP('basic-strategy')).toBe(STAGE_XP_BASE + STAGE_XP_STEP)
    expect(stageXP('table')).toBe(STAGE_XP_BASE + stageIndex('table') * STAGE_XP_STEP)
  })

  it('outweighs the rewards it is meant to sit above', () => {
    // A stage is three qualifying sessions plus an accuracy floor — it has to
    // be worth clearly more than one perfect session or a gold achievement.
    const bestSession = XP_REWARDS.sessionBase + XP_REWARDS.sessionPerfect100
    for (const s of drilled) {
      expect(stageXP(s.id), s.id).toBeGreaterThan(bestSession)
      expect(stageXP(s.id), s.id).toBeGreaterThan(XP_REWARDS.achievementGold)
    }
  })

  it('cannot level a fresh account up before it has trained', () => {
    // The regression this exists for, stated as the user experiences it.
    const readingOnly = CURRICULUM.filter(s => !s.drill).reduce((n, s) => n + stageXP(s.id), 0)
    expect(readingOnly).toBe(0)
  })

  it('returns nothing for an unknown stage', () => {
    expect(stageXP('nonsense' as never)).toBe(0)
  })
})

describe('claim record', () => {
  it('starts empty', () => {
    expect(getClaimedStages()).toEqual([])
  })

  it('remembers what has been paid', () => {
    markStageClaimed('rules')
    markStageClaimed('hi-lo')
    expect(getClaimedStages().sort()).toEqual(['hi-lo', 'rules'])
  })

  it('is idempotent', () => {
    markStageClaimed('rules')
    markStageClaimed('rules')
    expect(getClaimedStages()).toEqual(['rules'])
  })

  it('drops unknown ids rather than trusting storage', () => {
    localStorage.setItem('bjt_claimed_stages', JSON.stringify(['rules', 'made-up', 42]))
    expect(getClaimedStages()).toEqual(['rules'])
  })

  it('survives corrupted storage', () => {
    localStorage.setItem('bjt_claimed_stages', 'not json')
    expect(getClaimedStages()).toEqual([])
  })
})

describe('pendingStageAwards', () => {
  it('reports nothing when nothing is finished', () => {
    expect(pendingStageAwards(progressFor([]))).toEqual([])
  })

  it('reports a finished, unpaid stage with its title and value', () => {
    const [award, ...rest] = pendingStageAwards(progressFor(['basic-strategy']))
    expect(rest).toEqual([])
    expect(award).toEqual({
      stage: 'basic-strategy',
      title: CURRICULUM[stageIndex('basic-strategy')].title,
      xp: stageXP('basic-strategy'),
    })
  })

  it('reports nothing for a finished reading stage — a zero award is not an award', () => {
    // Reporting it would mark the stage claimed for a reward that never came.
    expect(pendingStageAwards(progressFor(['rules']))).toEqual([])
  })

  it('stops reporting a stage once it has been claimed', () => {
    markStageClaimed('basic-strategy')
    expect(pendingStageAwards(progressFor(['basic-strategy']))).toEqual([])
  })

  it('never pays the same stage twice, even if progress is rebuilt', () => {
    // Progress is derived from session history, which a cloud sync can replace
    // wholesale — the claim record is what stops a double payout.
    const progress = progressFor(['basic-strategy'])
    for (const a of pendingStageAwards(progress)) markStageClaimed(a.stage)
    expect(pendingStageAwards(progress)).toEqual([])
    expect(pendingStageAwards(progressFor(['basic-strategy', 'hi-lo'])))
      .toEqual([{ stage: 'hi-lo', title: CURRICULUM[stageIndex('hi-lo')].title, xp: stageXP('hi-lo') }])
  })

  it('reports in curriculum order so the payout narrative reads forwards', () => {
    const awards = pendingStageAwards(progressFor(['hi-lo', 'basic-strategy']))
    expect(awards.map(a => a.stage)).toEqual(['basic-strategy', 'hi-lo'])
  })

  it('changes nothing on its own', () => {
    pendingStageAwards(progressFor(['basic-strategy']))
    expect(getClaimedStages()).toEqual([])
  })
})

describe('totalStageXP', () => {
  it('is the sum of every stage', () => {
    expect(totalStageXP()).toBe(CURRICULUM.reduce((n, s) => n + stageXP(s.id), 0))
  })

  it('is worth chasing', () => {
    expect(totalStageXP()).toBeGreaterThan(1000)
  })
})
