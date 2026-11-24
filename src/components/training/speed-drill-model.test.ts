import { describe, it, expect } from 'vitest'
import type { TrainingSessionResult } from '../../services/stats-types'
import { CountingSystemId } from '../../engine/counting/types'
import {
  REVIEW_MAX_CARD,
  REVIEW_MIN_CARD,
  cardTags,
  cleanCountInput,
  countDraft,
  missHint,
  nextStep,
  quickPicks,
  reviewLayout,
  runCardHeight,
  secondsPerCard,
  speedBest,
  speedLabelKey,
} from './speed-drill-model'

/** A recorded Speed Drill session: one speed, one round size, an error per round. */
const drill = (speedMs: number, cardsPerRound: number, rcErrors: number[]): TrainingSessionResult => ({
  id: crypto.randomUUID(),
  mode: 'speedDrill',
  timestamp: '2026-11-01T10:00:00.000Z',
  countingSystem: CountingSystemId.HiLo,
  durationSeconds: 60,
  totalQuestions: rcErrors.length,
  correctAnswers: rcErrors.filter(e => e === 0).length,
  accuracy: 1,
  bestStreak: 1,
  details: { type: 'speedDrill', cardsPerRound, speedMs, rcErrors },
})

describe('the step after a round', () => {
  it('is the next faster speed after an exact round', () => {
    expect(nextStep(2000, 20)).toEqual({ kind: 'faster', speedMs: 1000 })
    expect(nextStep(1000, 20)).toEqual({ kind: 'faster', speedMs: 500 })
  })

  it('is more cards at the fastest speed', () => {
    expect(nextStep(500, 20)).toEqual({ kind: 'moreCards', cards: 30 })
    expect(nextStep(500, 30)).toEqual({ kind: 'moreCards', cards: 52 })
  })

  it('is nothing once both are at their top', () => {
    expect(nextStep(500, 52)).toBeNull()
  })

  it('is never harder after a miss: one speed slower, or nothing at the slowest', () => {
    expect(nextStep(500, 20, false)).toEqual({ kind: 'slower', speedMs: 1000 })
    expect(nextStep(1000, 52, false)).toEqual({ kind: 'slower', speedMs: 2000 })
    expect(nextStep(2000, 20, false)).toBeNull()
  })
})

describe('the count field', () => {
  it('shows a typed minus as the app’s real minus', () => {
    expect(cleanCountInput('-4')).toBe('−4')
    expect(cleanCountInput('−4')).toBe('−4')
    expect(cleanCountInput('–4')).toBe('−4')
  })

  it('keeps digits, one sign and one decimal mark, and drops the rest', () => {
    expect(cleanCountInput('+3')).toBe('3')
    expect(cleanCountInput('1.5.2')).toBe('1.52')
    expect(cleanCountInput('1,5')).toBe('1,5')
    expect(cleanCountInput('a4 b')).toBe('4')
    expect(cleanCountInput('--3')).toBe('−3')
    expect(cleanCountInput('')).toBe('')
  })

  it('writes a count back the same way', () => {
    expect(countDraft(-3)).toBe('−3')
    expect(countDraft(0)).toBe('0')
    expect(countDraft(2)).toBe('2')
  })
})

describe('the quick picks', () => {
  it('are a symmetric run of whole numbers around the starting count', () => {
    const picks = quickPicks(20)
    expect(picks[0]).toBe(-picks[picks.length - 1])
    expect(picks).toContain(0)
    picks.forEach((v, i) => { if (i > 0) expect(v - picks[i - 1]).toBe(1) })
  })

  it('widen with the round, between ±3 and ±6', () => {
    expect(quickPicks(10)).toHaveLength(9) // ±4
    expect(quickPicks(20)).toHaveLength(13) // ±6
    expect(quickPicks(52)).toHaveLength(13) // capped
    expect(quickPicks(1)).toHaveLength(7) // at least ±3
  })

  it('centre on the count the round started from (an unbalanced system starts below 0)', () => {
    expect(quickPicks(10, -20)).toContain(-20)
    expect(quickPicks(10, -20)[0]).toBe(-24)
  })

  it('cannot hint at the answer: they depend on nothing the cards decide', () => {
    // The signature is the guarantee — length and starting count, never the cards.
    expect(quickPicks.length).toBe(1)
    expect(quickPicks(20)).toEqual(quickPicks(20))
  })
})

describe('reading the tags back from the running counts', () => {
  it('is the step from each count to the next', () => {
    expect(cardTags([1, 0, -1, -1, 0], 0)).toEqual([1, -1, -1, 0, 1])
  })

  it('starts from the starting count', () => {
    expect(cardTags([-19], -20)).toEqual([1])
  })
})

describe('what can honestly be said about an answer', () => {
  // Cards: 5 (+1), K (−1), 9 (0), 3 (+1), A (−1) → counts 1, 0, 0, 1, 0.
  const RUN = [1, 0, 0, 1, 0]
  const base = { runningAfter: RUN, startCount: 0, tolerance: 0, hiLo: true }

  it('says nothing to look for when the answer is right', () => {
    expect(missHint({ ...base, answer: 0 })).toEqual({ kind: 'exact', diff: 0, marked: [] })
  })

  it('points at the last card when the answer is the count before it', () => {
    // 1 is the count before the ace. The one case where a card can be named.
    expect(missHint({ ...base, answer: 1 })).toEqual({ kind: 'lastCard', diff: 1, marked: [4] })
  })

  it('does not blame a last card that did not move the count', () => {
    // Last card a 9: the count before it equals the final count, so "before
    // the last card" is just the right answer — never a pointer.
    const run = [1, 0, 0]
    expect(missHint({ ...base, runningAfter: run, answer: 1 }).kind).toBe('oneHigh')
  })

  it('names a direction, not a card, when off by one', () => {
    const run = [1, 2, 1, 1] // last card a 9
    expect(missHint({ ...base, runningAfter: run, answer: 2 })).toEqual({ kind: 'oneHigh', diff: 1, marked: [] })
    expect(missHint({ ...base, runningAfter: run, answer: 0 })).toEqual({ kind: 'oneLow', diff: -1, marked: [] })
  })

  it('reads off by two as one card counted the wrong way round, or two missed', () => {
    const run = [1, 2, 1, 1]
    expect(missHint({ ...base, runningAfter: run, answer: 3 }).kind).toBe('twoHigh')
    expect(missHint({ ...base, runningAfter: run, answer: -1 }).kind).toBe('twoLow')
  })

  it('claims nothing about a larger miss', () => {
    expect(missHint({ ...base, answer: 5 })).toEqual({ kind: 'far', diff: 5, marked: [] })
    expect(missHint({ ...base, answer: -3 })).toEqual({ kind: 'far', diff: -3, marked: [] })
  })

  it('does not speak of Hi-Lo groups for another system', () => {
    const run = [1, 2, 1, 1]
    expect(missHint({ ...base, runningAfter: run, answer: 2, hiLo: false }).kind).toBe('far')
  })

  it('accepts Wong Halves answers within half a point', () => {
    expect(missHint({ ...base, runningAfter: [1.5, 1], answer: 1.5, tolerance: 0.5, hiLo: false }).kind).toBe('exact')
  })
})

describe('the personal best at a speed', () => {
  it('is the longest round counted exactly at that speed, from the recorded sessions', () => {
    const sessions = [drill(1000, 20, [0, 2, 0]), drill(1000, 30, [1, 0]), drill(500, 52, [0])]
    expect(speedBest(sessions, 1000, null)).toEqual({ bestCards: 30, exact: 3, rounds: 5 })
    expect(speedBest(sessions, 500, null)).toEqual({ bestCards: 52, exact: 1, rounds: 1 })
  })

  it('adds the rounds of the session on screen, which is recorded only when it ends', () => {
    const sessions = [drill(1000, 20, [0])]
    expect(speedBest(sessions, 1000, { cards: 30, errors: [0, 1] })).toEqual({ bestCards: 30, exact: 2, rounds: 3 })
  })

  it('has no best before the first exact round, and says how many were tried', () => {
    expect(speedBest([drill(2000, 10, [1, 3])], 2000, null)).toEqual({ bestCards: null, exact: 0, rounds: 2 })
    expect(speedBest([], 2000, null)).toEqual({ bestCards: null, exact: 0, rounds: 0 })
  })

  it('ignores other modes and other speeds', () => {
    const other = { ...drill(1000, 20, [0]), mode: 'betSpread' as const }
    expect(speedBest([other, drill(750, 20, [0])], 1000, null).rounds).toBe(0)
  })

  it('skips a session synced without details instead of failing', () => {
    const bare = { ...drill(1000, 20, [0]), details: undefined } as unknown as TrainingSessionResult
    expect(speedBest([bare, drill(1000, 10, [0])], 1000, null)).toEqual({ bestCards: 10, exact: 1, rounds: 1 })
  })

  it('counts a Wong Halves round within half a point as exact', () => {
    expect(speedBest([drill(1000, 20, [0.5])], 1000, null, 0.5).bestCards).toBe(20)
    expect(speedBest([drill(1000, 20, [0.5])], 1000, null, 0).bestCards).toBeNull()
  })
})

describe('the review layout', () => {
  it('lays twenty cards on a wide felt in two rows of ten, at the largest size', () => {
    const l = reviewLayout(1444, 476, 20)
    expect(l.cols).toBe(10)
    expect(l.cardWidth).toBe(REVIEW_MAX_CARD)
    expect(l.scroll).toBe(false)
  })

  it('fits a round in the space it is given, rows included', () => {
    for (const [w, h, n] of [[330, 380, 20], [410, 282, 20], [1444, 476, 52], [600, 500, 30]]) {
      const l = reviewLayout(w, h, n)
      const rows = Math.ceil(n / l.cols)
      expect(l.cols * l.cardWidth + (l.cols - 1) * l.gap).toBeLessThanOrEqual(w)
      if (!l.scroll) expect(rows * ((l.cardWidth * 7) / 5 + l.label) + (rows - 1) * l.gap).toBeLessThanOrEqual(h + 1)
    }
  })

  it('keeps every rank readable and scrolls rather than shrink a long round past that', () => {
    const l = reviewLayout(330, 200, 52)
    expect(l.scroll).toBe(true)
    expect(l.cardWidth).toBeGreaterThanOrEqual(REVIEW_MIN_CARD)
  })

  it('sets the count under a small card smaller', () => {
    expect(reviewLayout(1444, 476, 20).label).toBeGreaterThan(reviewLayout(330, 200, 52).label)
  })
})

describe('the running card', () => {
  it('is as large as the felt allows, within a card-like range', () => {
    expect(runCardHeight(1400, 478)).toBe(Math.round(478 * 0.82))
    expect(runCardHeight(1400, 2000)).toBe(460)
    expect(runCardHeight(100, 100)).toBe(140)
  })

  it('is limited by a narrow felt too', () => {
    expect(runCardHeight(200, 800)).toBe(Math.round((200 * 0.8 * 7) / 5))
  })
})

describe('the speeds as words', () => {
  it('writes seconds per card in the reader’s numbers', () => {
    expect(secondsPerCard(500, 'en')).toBe('0.5')
    expect(secondsPerCard(500, 'de')).toBe('0,5')
    expect(secondsPerCard(2000, 'en')).toBe('2')
  })

  it('has a name for the offered speeds only', () => {
    expect(speedLabelKey(1000)).toBe('training.speed.normal')
    expect(speedLabelKey(750)).toBeNull()
  })
})
