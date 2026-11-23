import { describe, it, expect } from 'vitest'
import { Action } from '../../engine/rules/types'
import { lookupBasicAction, type FlashQuestion } from '../../engine/strategy/flashcards'
import { S17_STRATEGY, H17_STRATEGY } from '../../engine/strategy/basic-strategy-tables'
import { basicReason, chartRowFor, deviationRuleFor } from './flash-teach'
import en from '../../i18n/messages/en.json'
import de from '../../i18n/messages/de.json'
import es from '../../i18n/messages/es.json'
import fr from '../../i18n/messages/fr.json'
import it_ from '../../i18n/messages/it.json'
import pt from '../../i18n/messages/pt.json'
import tr from '../../i18n/messages/tr.json'

const DEALERS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A']
const HARD = ['9', '10', '11', '12', '13', '14', '15', '16', '17']
const SOFT = ['A,2', 'A,3', 'A,4', 'A,5', 'A,6', 'A,7', 'A,8', 'A,9']
const PAIRS = ['2,2', '3,3', '4,4', '5,5', '6,6', '7,7', '8,8', '9,9', '10,10', 'A,A']

/** A basic question, built the way `makeBasicQuestion` builds one. */
function basic(hand: string, dealer: string, kind: FlashQuestion['handKind'], h17: boolean): FlashQuestion {
  const action = lookupBasicAction(hand, dealer, h17 ? H17_STRATEGY : S17_STRATEGY)
  return { handKind: kind, hand, dealer, trueCount: null, correctAction: action, basicAction: action, isDeviation: false, noSurrender: false }
}

function everyBasicQuestion(): FlashQuestion[] {
  const out: FlashQuestion[] = []
  for (const h17 of [false, true]) {
    for (const d of DEALERS) {
      HARD.forEach(h => out.push(basic(h, d, 'hard', h17)))
      SOFT.forEach(h => out.push(basic(h, d, 'soft', h17)))
      PAIRS.forEach(h => out.push(basic(h, d, 'pair', h17)))
    }
  }
  return out
}

/** Which plays a sentence may stand behind. A sentence that argues for standing must never sit under a hit. */
const ALLOWED: Record<string, Action[]> = {
  stiffStand: [Action.Stand],
  stiffHit: [Action.Hit],
  twelveHit: [Action.Hit],
  hardStand: [Action.Stand],
  hardDouble: [Action.Double],
  hardHit: [Action.Hit],
  softDouble: [Action.Double],
  softStand: [Action.Stand],
  softHit: [Action.Hit],
  soft18Hit: [Action.Hit],
  splitAlways: [Action.Split],
  split: [Action.Split],
  tensStand: [Action.Stand],
  fivesAsTen: [Action.Double, Action.Hit],
  pairAsTotal: [Action.Hit, Action.Stand],
  surrender: [Action.Surrender],
}

const WEAK = ['2', '3', '4', '5', '6']

describe('basicReason', () => {
  const all = everyBasicQuestion()

  it('gives every cell of both charts a sentence that argues for the play marked right', () => {
    for (const q of all) {
      const name = basicReason(q).key.replace('training.flash.why.', '')
      expect(ALLOWED[name], `${q.hand} v ${q.dealer}: ${name}`).toBeDefined()
      expect(ALLOWED[name], `${q.hand} v ${q.dealer}: ${name} under ${q.correctAction}`).toContain(q.correctAction)
    }
  })

  it('says "the dealer’s card is weak" only against 2 to 6, and "strong" only against 7 to ace', () => {
    for (const q of all) {
      const name = basicReason(q).key.replace('training.flash.why.', '')
      if (name === 'stiffStand' || name === 'softDouble') expect(WEAK, `${q.hand} v ${q.dealer}`).toContain(q.dealer)
      if (name === 'stiffHit') expect(WEAK, `${q.hand} v ${q.dealer}`).not.toContain(q.dealer)
      if (name === 'soft18Hit') expect(['9', '10', 'A']).toContain(q.dealer)
      if (name === 'twelveHit') expect(['2', '3']).toContain(q.dealer)
    }
  })

  it('passes the total the sentence names', () => {
    expect(basicReason(basic('16', '7', 'hard', false))).toEqual({ key: 'training.flash.why.stiffHit', values: { n: 16 } })
    expect(basicReason(basic('A,7', '2', 'soft', false))).toEqual({ key: 'training.flash.why.softStand', values: { n: 18 } })
    expect(basicReason(basic('9,9', '7', 'pair', false))).toEqual({ key: 'training.flash.why.pairAsTotal', values: { n: 18 } })
    expect(basicReason(basic('6,6', '4', 'pair', false))).toEqual({ key: 'training.flash.why.split', values: { rank: '6', n: 12 } })
  })

  it('has every sentence in all seven languages, with the same placeholders', () => {
    const locales = { en, de, es, fr, it: it_, pt, tr }
    const read = (m: unknown, key: string): string | undefined =>
      key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), m) as string | undefined
    const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()
    for (const name of Object.keys(ALLOWED)) {
      const key = `training.flash.why.${name}`
      const english = read(en, key)
      expect(english, key).toBeTypeOf('string')
      for (const [lang, m] of Object.entries(locales)) {
        const text = read(m, key)
        expect(text, `${lang} ${key}`).toBeTypeOf('string')
        expect(placeholders(text!), `${lang} ${key}`).toEqual(placeholders(english!))
      }
    }
  })
})

describe('chartRowFor', () => {
  it('cuts the hand’s row out of the chart and marks the dealer’s column', () => {
    const row = chartRowFor(basic('16', '10', 'hard', false), false)!
    expect(row.hand).toBe('16')
    expect(row.cells).toEqual(['S', 'S', 'S', 'S', 'S', 'H', 'H', 'SU', 'SU', 'SU'])
    expect(row.column).toBe(8)
    expect(row.noSurrender).toBe(false)
  })

  it('reads the chart the question was set from', () => {
    // 11 v A: hit under S17, double under H17.
    expect(chartRowFor(basic('11', 'A', 'hard', false), false)!.cells[9]).toBe('H')
    expect(chartRowFor(basic('11', 'A', 'hard', true), true)!.cells[9]).toBe('D')
  })

  it('shows a surrender cell’s fallback at a table without surrender', () => {
    const q = { ...basic('16', '10', 'hard', false), noSurrender: true }
    const row = chartRowFor(q, false)!
    expect(row.cells.slice(7)).toEqual(['H', 'H', 'H'])
    expect(row.noSurrender).toBe(true)
  })

  it('has no row for insurance, which is a side bet and not a cell', () => {
    expect(chartRowFor({ ...basic('16', 'A', 'hard', false), hand: '*' }, false)).toBeNull()
  })

  it('finds soft and pair rows', () => {
    expect(chartRowFor(basic('A,7', '9', 'soft', false), false)!.cells[7]).toBe('H')
    expect(chartRowFor(basic('8,8', '10', 'pair', false), false)!.cells[8]).toBe('SP')
  })
})

describe('deviationRuleFor', () => {
  it('gives the index of a deviation question', () => {
    const q: FlashQuestion = {
      handKind: 'hard', hand: '16', dealer: '10', trueCount: 2, correctAction: Action.Stand,
      basicAction: Action.Hit, isDeviation: true, deviationName: '16 vs 10', noSurrender: true,
    }
    expect(deviationRuleFor(q)).toEqual({ threshold: 0, above: Action.Stand, below: Action.Hit })
  })

  it('gives the insurance index', () => {
    const q: FlashQuestion = {
      handKind: 'hard', hand: '*', dealer: 'A', trueCount: 1, correctAction: Action.Hit,
      basicAction: Action.Hit, isDeviation: true, deviationName: 'Insurance', noSurrender: false,
    }
    expect(deviationRuleFor(q)).toEqual({ threshold: 3, above: Action.Insurance, below: Action.Hit })
  })

  it('is null for a basic-strategy question', () => {
    expect(deviationRuleFor(basic('16', '10', 'hard', false))).toBeNull()
  })
})
