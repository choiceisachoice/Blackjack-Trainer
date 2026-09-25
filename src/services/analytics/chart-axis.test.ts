import { describe, it, expect } from 'vitest'
import { labelIndexes, shortDay } from './chart-axis'

describe('shortDay', () => {
  it('drops the year and the padding', () => {
    expect(shortDay('2026-09-05')).toBe('5.9')
    expect(shortDay('2026-12-25')).toBe('25.12')
  })
})

describe('labelIndexes', () => {
  it('labels every bar when there are few', () => {
    expect([...labelIndexes(5)]).toEqual([0, 1, 2, 3, 4])
  })

  it('thins to about eight, always keeping the first and the last', () => {
    const l = labelIndexes(30)
    expect(l.size).toBeLessThanOrEqual(9)
    expect(l.has(0)).toBe(true)
    expect(l.has(29)).toBe(true)
  })

  it('is empty for no bars', () => {
    expect(labelIndexes(0).size).toBe(0)
  })
})
