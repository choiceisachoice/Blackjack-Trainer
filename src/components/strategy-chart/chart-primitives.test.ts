import { describe, it, expect } from 'vitest'
import { ILLUSTRIOUS_18 } from '../../engine/counting/deviations'
import { S17_STRATEGY } from '../../engine/strategy/basic-strategy-tables'
import {
  ACTION_COLORS,
  ACTION_INK,
  actionLabelKey,
  DEALER_KEYS,
  DEVIATION_CELLS,
  formatTC,
  resolveAction,
} from './chart-primitives'

describe('chart-primitives', () => {
  it('maps every engine action to a display code, and conditional ones to their base', () => {
    expect(resolveAction('H')).toBe('H')
    expect(resolveAction('S')).toBe('S')
    expect(resolveAction('D')).toBe('D')
    expect(resolveAction('Ds')).toBe('D')
    expect(resolveAction('P')).toBe('SP')
    expect(resolveAction('Rh')).toBe('SU')
    expect(resolveAction('Rs')).toBe('SU')
  })

  it('has a fill for every display code and one dark ink for all of them', () => {
    for (const code of ['H', 'S', 'D', 'SP', 'SU'] as const) {
      expect(ACTION_COLORS[code]).toMatch(/^#[0-9a-f]{6}$/)
    }
    expect(ACTION_INK).toBe('#10100c')
  })

  it('lists the dealer upcards in table order, ace last', () => {
    expect([...DEALER_KEYS]).toEqual(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'])
  })

  it('formats the true count with an explicit sign', () => {
    expect(formatTC(2)).toBe('+2')
    expect(formatTC(0)).toBe('0')
    expect(formatTC(-1)).toBe('−1')
  })

  it('derives the deviation map from the engine, leaving insurance out', () => {
    // Every Illustrious 18 play except insurance ('*') lands on a chart cell.
    const plays = ILLUSTRIOUS_18.filter(d => d.playerHand !== '*')
    expect(Object.keys(DEVIATION_CELLS)).toHaveLength(plays.length)
    expect(DEVIATION_CELLS['*|A']).toBeUndefined()
  })

  it('maps the engine action names onto the chart label keys, and passes the rest through', () => {
    expect(actionLabelKey('Hit')).toBe('chart.action.H')
    expect(actionLabelKey('Stand')).toBe('chart.action.S')
    expect(actionLabelKey('Double')).toBe('chart.action.D')
    expect(actionLabelKey('Split')).toBe('chart.action.SP')
    expect(actionLabelKey('Surrender')).toBe('chart.action.SU')
    // No cell code exists for this; it must not become a missing-key string.
    expect(actionLabelKey('Insurance')).toBe('Insurance')
  })

  it('carries the play the landing page shows: 16 vs 10 stands from TC 0', () => {
    // This is the cell the showcase highlights, so it is pinned here — if the
    // engine's list changes, the landing must follow, not silently drift.
    const dev = DEVIATION_CELLS['16|10']
    expect(dev).toBeDefined()
    expect(dev.threshold).toBe(0)
    // `above` is the engine's Action, shown verbatim by the chart — not a StrategyAction code.
    expect(dev.above).toBe('Stand')
    // …and the basic-strategy cell under it is a different play, which is what
    // makes it a deviation worth showing.
    expect(resolveAction(S17_STRATEGY.hardTotals['16']['10'])).not.toBe('S')
  })
})
