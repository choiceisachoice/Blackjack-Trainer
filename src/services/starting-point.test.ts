import { describe, it, expect } from 'vitest'
import {
  ENTRY_OPTIONS,
  DEFAULT_ENTRY,
  TOTAL_STAGES,
  stageForLevel,
  levelIndex,
  levelForStage,
  isCompleteBeginner,
  stagesSkipped,
} from './starting-point'
import { CURRICULUM, stageIndex } from './curriculum'

describe('the starting-point question', () => {
  it('offers exactly one rung per curriculum stage', () => {
    // The property that matters: no two answers may produce the same
    // placement, or two options are silently the same question.
    expect(ENTRY_OPTIONS).toHaveLength(TOTAL_STAGES)
    expect(new Set(ENTRY_OPTIONS.map(o => o.stage)).size).toBe(TOTAL_STAGES)
  })

  it('has a distinct value per option', () => {
    expect(new Set(ENTRY_OPTIONS.map(o => o.value)).size).toBe(ENTRY_OPTIONS.length)
  })

  it('places every answer at a real stage of the curriculum', () => {
    for (const o of ENTRY_OPTIONS) {
      expect(CURRICULUM.some(s => s.id === o.stage)).toBe(true)
    }
  })

  it('runs monotonically up the path — a higher claim never places lower', () => {
    const indices = ENTRY_OPTIONS.map(o => stageIndex(o.stage))
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1])
    }
  })

  it('starts the complete beginner at the very first stage', () => {
    expect(DEFAULT_ENTRY.value).toBe('new')
    expect(stageForLevel('new')).toBe(CURRICULUM[0].id)
    expect(stagesSkipped('new')).toBe(0)
  })

  it('places the experienced player on the final stage, not past it', () => {
    const last = ENTRY_OPTIONS[ENTRY_OPTIONS.length - 1]
    expect(last.stage).toBe(CURRICULUM[CURRICULUM.length - 1].id)
  })
})

describe('reading a level back', () => {
  it('round-trips level → stage → level for every option', () => {
    for (const o of ENTRY_OPTIONS) {
      expect(levelForStage(o.stage).value).toBe(o.value)
    }
  })

  it('falls back to the beginning for an unknown value rather than throwing', () => {
    // A stored answer from an older build must drop someone to the start of
    // the path, not break the plan on load.
    expect(stageForLevel('from-an-older-build')).toBe(DEFAULT_ENTRY.stage)
    expect(levelIndex('from-an-older-build')).toBe(-1)
    expect(stagesSkipped('from-an-older-build')).toBe(0)
  })

  it('knows the complete beginner from everyone else', () => {
    expect(isCompleteBeginner('new')).toBe(true)
    for (const o of ENTRY_OPTIONS.slice(1)) {
      expect(isCompleteBeginner(o.value)).toBe(false)
    }
  })

  it('counts skipped stages from the placement', () => {
    for (const o of ENTRY_OPTIONS) {
      expect(stagesSkipped(o.value)).toBe(stageIndex(o.stage))
    }
  })
})

describe('the copy', () => {
  it('gives every option a label and a hint', () => {
    for (const o of ENTRY_OPTIONS) {
      expect(o.label.length).toBeGreaterThan(0)
      expect(o.hint.length).toBeGreaterThan(0)
    }
  })

  it('never labels an option with a self-assessment word', () => {
    // "Intermediate" cannot be checked and means something different to
    // everyone. Every label has to name a capability instead.
    const vague = /\b(beginner|intermediate|advanced|expert|novice|pro)\b/i
    for (const o of ENTRY_OPTIONS) {
      expect(o.label).not.toMatch(vague)
    }
  })
})
