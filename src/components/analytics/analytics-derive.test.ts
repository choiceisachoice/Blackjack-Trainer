import { describe, it, expect } from 'vitest'
import { CountingSystemId } from '../../engine/counting/types'
import type { TrainingSessionResult, SessionDetails, TrainingMode } from '../../services/stats-types'
import {
  filterByRange,
  filterPreviousRange,
  accuracyOf,
  buildKpis,
  buildTrend,
  buildHeatmap,
  buildModeAccuracy,
  buildSkillRadar,
  buildEdge,
  buildWeakestHands,
  deriveInsight,
  formatDuration,
  splitHoursMinutes,
  formatWhen,
} from './analytics-derive'

const NOW = new Date('2026-07-08T12:00:00.000Z')
const DAY = 86_400_000

/** Build a session `daysAgo` before NOW at noon UTC. */
function makeSession(overrides: Partial<TrainingSessionResult> & { daysAgo?: number } = {}): TrainingSessionResult {
  const { daysAgo = 0, ...rest } = overrides
  const ts = new Date(NOW.getTime() - daysAgo * DAY).toISOString()
  const defaultDetails: SessionDetails = { type: 'speedDrill', cardsPerRound: 10, speedMs: 1000, rcErrors: [] }
  return {
    id: crypto.randomUUID(),
    mode: 'speedDrill',
    timestamp: ts,
    countingSystem: CountingSystemId.HiLo,
    durationSeconds: 120,
    totalQuestions: 10,
    correctAnswers: 8,
    accuracy: 0.8,
    bestStreak: 5,
    details: defaultDetails,
    ...rest,
  }
}

describe('formatting helpers', () => {
  it('formatDuration', () => {
    expect(formatDuration(30)).toBe('< 1m')
    expect(formatDuration(90)).toBe('1m')
    expect(formatDuration(3600)).toBe('1h 0m')
    expect(formatDuration(7500)).toBe('2h 5m')
  })

  it('splitHoursMinutes', () => {
    expect(splitHoursMinutes(7500)).toEqual({ hours: 2, minutes: 5 })
    expect(splitHoursMinutes(45)).toEqual({ hours: 0, minutes: 0 })
  })

  it('formatWhen labels today/yesterday/date', () => {
    expect(formatWhen(NOW.toISOString(), NOW)).toBe('Today')
    expect(formatWhen(new Date(NOW.getTime() - DAY).toISOString(), NOW)).toBe('Yesterday')
    expect(formatWhen(new Date(NOW.getTime() - 5 * DAY).toISOString(), NOW)).toBe('Jul 3')
  })
})

describe('range filtering', () => {
  const sessions = [
    makeSession({ daysAgo: 2 }),
    makeSession({ daysAgo: 10 }),
    makeSession({ daysAgo: 40 }),
    makeSession({ daysAgo: 100 }),
  ]

  it('filterByRange respects the window', () => {
    expect(filterByRange(sessions, '7d', NOW)).toHaveLength(1)
    expect(filterByRange(sessions, '30d', NOW)).toHaveLength(2)
    expect(filterByRange(sessions, '90d', NOW)).toHaveLength(3)
    expect(filterByRange(sessions, 'all', NOW)).toHaveLength(4)
  })

  it('filterPreviousRange returns the preceding equal window; empty for all', () => {
    // 7d previous window = 14..7 days ago → the 10-days-ago session
    expect(filterPreviousRange(sessions, '7d', NOW)).toHaveLength(1)
    expect(filterPreviousRange(sessions, 'all', NOW)).toHaveLength(0)
  })
})

describe('accuracyOf', () => {
  it('weights by questions, not by session', () => {
    const s = [
      makeSession({ totalQuestions: 10, correctAnswers: 10 }),
      makeSession({ totalQuestions: 90, correctAnswers: 45 }),
    ]
    // 55 / 100 = 0.55
    expect(accuracyOf(s)).toBeCloseTo(0.55, 5)
  })

  it('returns 0 for no questions', () => {
    expect(accuracyOf([])).toBe(0)
  })
})

describe('buildKpis', () => {
  it('computes range-scoped values and deltas vs previous window', () => {
    const sessions = [
      // current 7d window: 2 sessions, 20 questions, 18 correct → 90%
      makeSession({ daysAgo: 1, totalQuestions: 10, correctAnswers: 9, durationSeconds: 300 }),
      makeSession({ daysAgo: 3, totalQuestions: 10, correctAnswers: 9, durationSeconds: 300 }),
      // previous 7d window (7..14 days ago): 1 session, 10 q, 7 correct → 70%
      makeSession({ daysAgo: 9, totalQuestions: 10, correctAnswers: 7, durationSeconds: 120 }),
    ]
    const kpis = buildKpis(sessions, '7d', 4, NOW)
    const byKey = Object.fromEntries(kpis.map(k => [k.key, k]))

    expect(byKey.accuracy.display).toBe('90~%')
    expect(byKey.accuracy.delta).toBeCloseTo(20, 5) // 90 - 70
    expect(byKey.sessions.display).toBe('2')
    expect(byKey.sessions.delta).toBe(1) // 2 - 1
    expect(byKey.hands.display).toBe('20')
    expect(byKey.hands.delta).toBe(10) // 20 - 10
    expect(byKey.streak.display).toBe('4~ days')
    expect(byKey.time.delta).toBe(600 - 120)
  })

  it('has null deltas for the all range', () => {
    const kpis = buildKpis([makeSession()], 'all', 1, NOW)
    for (const k of kpis) expect(k.delta).toBeNull()
  })
})

describe('buildTrend', () => {
  it('produces one chronological accuracy point per active day', () => {
    const sessions = [
      makeSession({ daysAgo: 0, totalQuestions: 10, correctAnswers: 8 }),
      makeSession({ daysAgo: 1, totalQuestions: 10, correctAnswers: 6 }),
      makeSession({ daysAgo: 1, totalQuestions: 10, correctAnswers: 4 }), // same day → merges
    ]
    const trend = buildTrend(sessions, '7d', NOW)
    expect(trend).toHaveLength(2)
    // oldest first
    expect(trend[0].accuracy).toBe(50) // (6+4)/20
    expect(trend[1].accuracy).toBe(80)
  })
})

describe('buildHeatmap', () => {
  it('returns a 12×7 grid ending today', () => {
    const { cells } = buildHeatmap([makeSession({ daysAgo: 0, durationSeconds: 600 })], NOW)
    expect(cells).toHaveLength(12)
    expect(cells[0]).toHaveLength(7)
    // last cell is today
    expect(cells[11][6].day).toBe(NOW.toISOString().slice(0, 10))
    expect(cells[11][6].level).toBeGreaterThan(0)
  })

  it('marks empty days at level 0', () => {
    const { cells } = buildHeatmap([], NOW)
    expect(cells.flat().every(c => c.level === 0)).toBe(true)
  })
})

describe('buildModeAccuracy', () => {
  it('sorts strongest-first and tags best/focus', () => {
    const sessions = [
      makeSession({ mode: 'deviationFlashCards', totalQuestions: 10, correctAnswers: 9, details: dev({ '16 vs 10': [9, 1] }) }),
      makeSession({ mode: 'deckEstimation', totalQuestions: 10, correctAnswers: 5, details: { type: 'deckEstimation', deckCount: 6, accuracyMode: 'half', quickFire: false, estimations: [] } }),
    ]
    const rows = buildModeAccuracy(sessions, '30d', NOW)
    expect(rows[0].mode).toBe('deviationFlashCards')
    expect(rows[0].tag).toBe('best')
    expect(rows[rows.length - 1].tag).toBe('focus')
  })
})

describe('buildSkillRadar', () => {
  it('maps each area to its mode accuracy (0 when untrained)', () => {
    const sessions = [makeSession({ mode: 'speedDrill', totalQuestions: 10, correctAnswers: 9 })]
    const radar = buildSkillRadar(sessions, 'all', NOW)
    const counting = radar.find(a => a.axis === 'Counting')!
    const betting = radar.find(a => a.axis === 'Betting')!
    expect(counting.value).toBe(90)
    expect(betting.value).toBe(0)
    expect(radar).toHaveLength(5)
  })
})

describe('buildEdge', () => {
  it('accumulates real Casino Session net profit', () => {
    const casino = (daysAgo: number, netProfit: number, hands: number): TrainingSessionResult =>
      makeSession({
        mode: 'casinoSession',
        daysAgo,
        details: {
          type: 'casinoSession', handsPlayed: hands, netProfit, overallScore: 80, grade: 'B',
          betAccuracy: 80, playAccuracy: 85, countAccuracy: 90, deviationAccuracy: 75,
          numBots: 2, hadBlackjack: true, longestWinStreak: 3, splitAces: false, maxSplitHands: 2,
        },
      })
    const sessions = [casino(5, 200, 40), casino(2, -50, 30), casino(1, 280, 35)]
    const edge = buildEdge(sessions, '30d', NOW)
    expect(edge.sessions).toBe(3)
    expect(edge.net).toBe(430)
    expect(edge.handsPlayed).toBe(105)
    // points include the 0 origin + one per session
    expect(edge.points).toHaveLength(4)
    expect(edge.points[0].cumulative).toBe(0)
    expect(edge.points[3].cumulative).toBe(430)
  })

  it('is empty when no casino sessions exist', () => {
    expect(buildEdge([makeSession()], '30d', NOW).sessions).toBe(0)
  })
})

describe('buildWeakestHands', () => {
  it('aggregates per-deviation accuracy across sessions, weakest first', () => {
    const sessions = [
      makeSession({ mode: 'deviationFlashCards', details: dev({ '16 vs 10': [8, 2], '15 vs 10': [3, 7] }) }),
      makeSession({ mode: 'deviationFlashCards', details: dev({ '16 vs 10': [6, 4] }) }),
    ]
    const weak = buildWeakestHands(sessions, 'all', NOW)
    expect(weak[0].name).toBe('15 vs 10')
    expect(weak[0].accuracy).toBeCloseTo(0.3, 5)
    const sixteen = weak.find(w => w.name === '16 vs 10')!
    expect(sixteen.accuracy).toBeCloseTo(0.7, 5) // (8+6)/20
  })

  it('excludes deviations with no attempts', () => {
    const sessions = [makeSession({ mode: 'deviationFlashCards', details: dev({ Empty: [0, 0], '16 vs 10': [5, 5] }) })]
    const weak = buildWeakestHands(sessions, 'all', NOW)
    expect(weak.map(w => w.name)).toEqual(['16 vs 10'])
  })
})

describe('deriveInsight', () => {
  it('prioritizes a clearly weak hand', () => {
    const sessions = [makeSession({ mode: 'deviationFlashCards', details: dev({ '16 vs 10': [2, 8] }) })]
    const insight = deriveInsight(sessions, 'all', 1, NOW)
    expect(insight.text).toContain('16 vs 10')
    expect(insight.highlights).toContain('16 vs 10')
  })

  it('falls back to an empty-state prompt with no sessions', () => {
    const insight = deriveInsight([], '7d', 0, NOW)
    expect(insight.text).toMatch(/insights will show up/i)
  })

  it('reports an improving trend', () => {
    const sessions = [
      makeSession({ daysAgo: 1, totalQuestions: 10, correctAnswers: 9 }),
      makeSession({ daysAgo: 9, totalQuestions: 10, correctAnswers: 6 }),
    ]
    const insight = deriveInsight(sessions, '7d', 1, NOW)
    expect(insight.text).toMatch(/climbed/i)
  })
})

/** Helper: build DeviationDetails from name → [correct, incorrect] pairs. */
function dev(perDeviation: Record<string, [number, number]>): SessionDetails {
  const per: Record<string, { correct: number; incorrect: number }> = {}
  for (const [name, [correct, incorrect]] of Object.entries(perDeviation)) {
    per[name] = { correct, incorrect }
  }
  return { type: 'deviationFlashCards', deviationSet: 'all', perDeviation: per }
}

// Type guard sanity: modes referenced above are valid TrainingMode values.
const _modes: TrainingMode[] = ['speedDrill', 'deviationFlashCards', 'deckEstimation', 'casinoSession']
void _modes
