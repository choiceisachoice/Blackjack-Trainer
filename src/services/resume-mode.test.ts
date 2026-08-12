import { describe, it, expect } from 'vitest'
import i18next from 'i18next'
import { resumeTargetFor } from './resume-mode'
import type { TrainingMode } from './stats-types'

const LIVE_MODES: TrainingMode[] = [
  'speedDrill',
  'deviationFlashCards',
  'betSpread',
  'deckEstimation',
  'casinoSession',
]

/** Modes that still appear in persisted history but no longer have a screen. */
const RETIRED_MODES: TrainingMode[] = ['tableCounting', 'deviationAtTable']

describe('resumeTargetFor', () => {
  it('resolves every live training mode to a screen and a label', () => {
    for (const mode of LIVE_MODES) {
      const target = resumeTargetFor(mode)
      expect(target, `expected a target for ${mode}`).not.toBeNull()
      expect(i18next.t(target!.labelKey)).not.toBe(target!.labelKey)
    }
  })

  it('maps the flashcards session mode onto its differently-named screen', () => {
    // TrainingMode 'deviationFlashCards' is the AppMode 'deviationTraining' screen.
    expect(resumeTargetFor('deviationFlashCards')).toEqual({
      mode: 'deviationTraining',
      labelKey: 'modes.deviationFlashCards',
    })
  })

  it('returns null for retired modes so old history cannot route nowhere', () => {
    for (const mode of RETIRED_MODES) {
      expect(resumeTargetFor(mode), `${mode} should have no screen`).toBeNull()
    }
  })

  it('maps same-named modes onto themselves', () => {
    expect(resumeTargetFor('speedDrill')?.mode).toBe('speedDrill')
    expect(resumeTargetFor('betSpread')?.mode).toBe('betSpread')
    expect(resumeTargetFor('deckEstimation')?.mode).toBe('deckEstimation')
    expect(resumeTargetFor('casinoSession')?.mode).toBe('casinoSession')
  })
})
