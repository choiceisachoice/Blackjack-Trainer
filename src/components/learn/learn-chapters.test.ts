import { describe, it, expect } from 'vitest'
import { LEARN_TOPICS } from '../../services/learn-topics'
import {
  CHAPTER_COLUMNS,
  LEARN_CHAPTERS,
  PRACTISABLE,
  messageStrings,
  practiceCount,
  readingMinutes,
} from './learn-chapters'

describe('learn chapters', () => {
  it('carries every public chapter, in the public order', () => {
    const topics = LEARN_CHAPTERS.filter(c => c.kind === 'topic').map(c => c.id)
    expect(topics).toEqual(LEARN_TOPICS.map(t => t.id))
  })

  it('numbers the reading chapters 1 to 9 and leaves the reference pages unnumbered', () => {
    const numbered = LEARN_CHAPTERS.filter(c => c.number != null).map(c => c.number)
    expect(numbered).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(LEARN_CHAPTERS.filter(c => c.number == null).map(c => c.kind)).toEqual(['faq', 'modes'])
  })

  it('puts every chapter in one of the four columns', () => {
    for (const c of LEARN_CHAPTERS) expect(CHAPTER_COLUMNS).toContain(c.column)
    for (const col of CHAPTER_COLUMNS) expect(LEARN_CHAPTERS.some(c => c.column === col)).toBe(true)
  })

  it('counts nine chapters whose practice is recorded', () => {
    expect(PRACTISABLE).toHaveLength(9)
    expect(PRACTISABLE.every(c => c.practice !== 'plan')).toBe(true)
  })

  it('counts the sessions of a mode, including the flashcards older names', () => {
    const sessions = [
      { mode: 'speedDrill' as const },
      { mode: 'speedDrill' as const },
      { mode: 'deviationFlashCards' as const },
      { mode: 'tableCounting' as const },
      { mode: 'betSpread' as const },
    ]
    expect(practiceCount(sessions, 'speedDrill')).toBe(2)
    expect(practiceCount(sessions, 'deviationTraining')).toBe(2)
    expect(practiceCount(sessions, 'deckEstimation')).toBe(0)
    expect(practiceCount(sessions, 'plan')).toBe(0)
    expect(practiceCount(sessions, null)).toBe(0)
  })

  it('reads 200 words a minute, ignores markup and never says zero', () => {
    expect(readingMinutes([])).toBe(1)
    expect(readingMinutes(['one <g>two</g> three'])).toBe(1)
    const words = Array.from({ length: 401 }, () => 'word').join(' ')
    expect(readingMinutes([words])).toBe(3)
  })

  it('collects every string of a nested message object', () => {
    expect(messageStrings({ a: 'x', b: { c: 'y', d: ['z'] } })).toEqual(['x', 'y', 'z'])
    expect(messageStrings(42)).toEqual([])
  })
})
