import { describe, it, expect } from 'vitest'
import { deviationRows, FAB_4_ROWS, ILLUSTRIOUS_18_ROWS } from './deviation-table'
import { ILLUSTRIOUS_18, FAB_4 } from '../engine/counting/deviations'

describe('deviation table rows', () => {
  it('carries every entry of both lists, in the engine’s order', () => {
    expect(ILLUSTRIOUS_18_ROWS).toHaveLength(ILLUSTRIOUS_18.length)
    expect(FAB_4_ROWS).toHaveLength(FAB_4.length)
    expect(ILLUSTRIOUS_18_ROWS[0].anyHand).toBe(true) // insurance leads
  })

  it('pins the four indices the prose quotes, so the text cannot drift from the table', () => {
    // The Learn chapter names these four by number. If the engine changes
    // one, this fails and the prose (seven languages) must follow.
    const find = (hand: string, dealer: string) => ILLUSTRIOUS_18_ROWS.find(r => r.hand === hand && r.dealer === dealer)
    expect(find('*', 'A')?.index).toBe(3)
    expect(find('16', '10')?.index).toBe(0)
    expect(find('15', '10')?.index).toBe(4)
    expect(find('10,10', '5')?.index).toBe(5)
  })

  it('pins the Fab 4 as surrender plays', () => {
    for (const row of FAB_4_ROWS) expect(row.above).toBe('Surrender')
    expect(FAB_4_ROWS.map(r => `${r.hand}v${r.dealer}@${r.index}`)).toEqual(['14v10@3', '15v10@0', '15v9@2', '15vA@1'])
  })

  it('maps fields one to one', () => {
    const [row] = deviationRows([ILLUSTRIOUS_18[1]])
    expect(row).toEqual({ hand: '16', anyHand: false, dealer: '10', index: 0, above: 'Stand', below: 'Hit' })
  })
})
