import { describe, it, expect } from 'vitest'
import { Action } from '../rules/types'
import { S17_STRATEGY } from './basic-strategy-tables'
import {
  resolveStrategyAction,
  handKindOf,
  lookupBasicAction,
  enabledActions,
  buildFlashSession,
  buildFocusFlashSession,
  drillableDeviationNames,
  type FlashQuestion,
} from './flashcards'

describe('flashcards engine', () => {
  it('resolveStrategyAction maps conditional codes to primary actions', () => {
    expect(resolveStrategyAction('H')).toBe(Action.Hit)
    expect(resolveStrategyAction('S')).toBe(Action.Stand)
    expect(resolveStrategyAction('D')).toBe(Action.Double)
    expect(resolveStrategyAction('Ds')).toBe(Action.Double)
    expect(resolveStrategyAction('P')).toBe(Action.Split)
    expect(resolveStrategyAction('Rh')).toBe(Action.Surrender)
    expect(resolveStrategyAction('Rs')).toBe(Action.Surrender)
  })

  it('handKindOf classifies hard / soft / pair', () => {
    expect(handKindOf('16')).toBe('hard')
    expect(handKindOf('A,7')).toBe('soft')
    expect(handKindOf('8,8')).toBe('pair')
    expect(handKindOf('10,10')).toBe('pair')
    expect(handKindOf('A,A')).toBe('pair')
  })

  it('lookupBasicAction matches the S17 basic strategy table', () => {
    expect(lookupBasicAction('16', '10', S17_STRATEGY)).toBe(Action.Surrender) // Rh
    expect(lookupBasicAction('8,8', '10', S17_STRATEGY)).toBe(Action.Split)
    expect(lookupBasicAction('A,7', '9', S17_STRATEGY)).toBe(Action.Hit)
    expect(lookupBasicAction('11', '6', S17_STRATEGY)).toBe(Action.Double)
    expect(lookupBasicAction('13', '5', S17_STRATEGY)).toBe(Action.Stand)
    expect(lookupBasicAction('10,10', '6', S17_STRATEGY)).toBe(Action.Stand)
  })

  it('enabledActions offers split only for pairs and insurance only vs an Ace', () => {
    const pair: FlashQuestion = { handKind: 'pair', hand: '8,8', dealer: '10', trueCount: null, correctAction: Action.Split, basicAction: Action.Split, isDeviation: false }
    const hardVsAce: FlashQuestion = { handKind: 'hard', hand: '16', dealer: 'A', trueCount: null, correctAction: Action.Hit, basicAction: Action.Hit, isDeviation: false }
    expect(enabledActions(pair)[Action.Split]).toBe(true)
    expect(enabledActions(pair)[Action.Insurance]).toBe(false)
    expect(enabledActions(hardVsAce)[Action.Split]).toBe(false)
    expect(enabledActions(hardVsAce)[Action.Insurance]).toBe(true)
  })

  it('buildFlashSession (basic) has no True Count and no consecutive repeats', () => {
    const session = buildFlashSession('basic', 25)
    expect(session).toHaveLength(25)
    for (const q of session) {
      expect(q.trueCount).toBeNull()
      expect(q.isDeviation).toBe(false)
    }
    for (let i = 1; i < session.length; i++) {
      const a = session[i], b = session[i - 1]
      expect(`${a.hand}|${a.dealer}`).not.toBe(`${b.hand}|${b.dealer}`)
    }
  })

  it('buildFlashSession (deviations) always includes a True Count', () => {
    const session = buildFlashSession('deviations', 20)
    expect(session).toHaveLength(20)
    for (const q of session) {
      expect(q.trueCount).not.toBeNull()
      expect(q.isDeviation).toBe(true)
    }
  })

  it('buildFlashSession (mixed) yields both kinds over a large sample', () => {
    const session = buildFlashSession('mixed', 50)
    expect(session).toHaveLength(50)
    expect(session.some(q => q.isDeviation)).toBe(true)
    expect(session.some(q => !q.isDeviation)).toBe(true)
  })

  describe('focus drill (the Analytics hand-off)', () => {
    it('drillableDeviationNames keeps known names, drops the rest, and dedupes', () => {
      expect(drillableDeviationNames(['16 vs 10', 'no such hand', 'Insurance', '16 vs 10']))
        .toEqual(['16 vs 10', 'Insurance'])
    })

    it('asks only the named hands, and each of them', () => {
      const names = ['16 vs 10', '15 vs 10', 'Insurance', '12 vs 3']
      const session = buildFocusFlashSession(names, 20)
      expect(session).toHaveLength(20)
      const asked = new Set<string>()
      for (const q of session) {
        expect(q.isDeviation).toBe(true)
        expect(q.trueCount).not.toBeNull()
        expect(names).toContain(q.deviationName)
        asked.add(q.deviationName!)
      }
      // A round-robin over 4 hands in 20 questions asks each exactly 5 times.
      expect(asked.size).toBe(4)
      for (const n of names) {
        expect(session.filter(q => q.deviationName === n)).toHaveLength(5)
      }
    })

    it('with a single hand, consecutive questions still differ by count', () => {
      const session = buildFocusFlashSession(['16 vs 10'], 12)
      expect(session).toHaveLength(12)
      for (let i = 1; i < session.length; i++) {
        expect(session[i].trueCount).not.toBe(session[i - 1].trueCount)
      }
    })

    it('is empty when nothing drillable was named, so the caller can fall back', () => {
      expect(buildFocusFlashSession(['no such hand'], 10)).toEqual([])
      expect(buildFocusFlashSession([], 10)).toEqual([])
    })

    it('grades the hand against the real deviation index', () => {
      // 16 vs 10: stand at TC >= 0, otherwise hit.
      const session = buildFocusFlashSession(['16 vs 10'], 30)
      for (const q of session) {
        const expected = q.trueCount! >= 0 ? Action.Stand : Action.Hit
        expect(q.correctAction).toBe(expected)
      }
    })
  })
})
