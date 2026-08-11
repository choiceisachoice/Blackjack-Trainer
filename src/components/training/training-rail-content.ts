import type { TrainingMode } from '../../services/stats-types'

/**
 * Per-mode content for the settings-screen context rails: a short "how it
 * works" sequence and a pro-tip. Keyed by the stats `TrainingMode` so the rail
 * can also pull that mode's real last-run figures.
 *
 * Translation keys rather than text: the rail is the first thing someone reads
 * on a mode they have not tried, which is exactly when being in the wrong
 * language costs the most.
 */
export const RAIL_CONTENT: Partial<Record<TrainingMode, { steps: string[]; tip: string }>> = {
  speedDrill: {
    steps: ['training.rail.speedDrill.s1', 'training.rail.speedDrill.s2', 'training.rail.speedDrill.s3'],
    tip: 'training.rail.speedDrill.tip',
  },
  deviationFlashCards: {
    steps: ['training.rail.deviationFlashCards.s1', 'training.rail.deviationFlashCards.s2', 'training.rail.deviationFlashCards.s3'],
    tip: 'training.rail.deviationFlashCards.tip',
  },
  betSpread: {
    steps: ['training.rail.betSpread.s1', 'training.rail.betSpread.s2', 'training.rail.betSpread.s3'],
    tip: 'training.rail.betSpread.tip',
  },
  deckEstimation: {
    steps: ['training.rail.deckEstimation.s1', 'training.rail.deckEstimation.s2', 'training.rail.deckEstimation.s3'],
    tip: 'training.rail.deckEstimation.tip',
  },
  casinoSession: {
    steps: ['training.rail.casinoSession.s1', 'training.rail.casinoSession.s2', 'training.rail.casinoSession.s3'],
    tip: 'training.rail.casinoSession.tip',
  },
}
