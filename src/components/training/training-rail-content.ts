import type { TrainingMode } from '../../services/stats-types'

/**
 * Per-mode content for the settings-screen context rails: a short "how it
 * works" sequence and a pro-tip. Keyed by the stats `TrainingMode` so the rail
 * can also pull that mode's real last-run figures.
 */
export const RAIL_CONTENT: Partial<Record<TrainingMode, { steps: string[]; tip: string }>> = {
  speedDrill: {
    steps: ['Cards flash by briefly.', 'Keep the running count as they go.', 'Enter your final count at the end.'],
    tip: 'Count in pairs (+2 / 0 / −2) rather than card by card — much faster at casino speed.',
  },
  deviationFlashCards: {
    steps: ['A hand + dealer card + true count.', 'Pick the correct action.', 'Do you deviate from basic strategy right?'],
    tip: 'The Illustrious 18 carry most of the deviation edge — master those first.',
  },
  betSpread: {
    steps: ['A true count is shown.', 'Choose the optimal bet size.', 'Closer to optimal = more points.'],
    tip: 'Rule of thumb: bet ≈ (true count − 1) × unit. It usually turns profitable from TC +2.',
  },
  deckEstimation: {
    steps: ['Watch the thickness of the discard tray.', 'Estimate the decks remaining.', 'The closer you are, the higher your score.'],
    tip: 'Count in decks, not cards — a full deck is ~19 mm in the discard tray.',
  },
  casinoSession: {
    steps: ['Take your seat and keep the count silently.', 'Size each bet by the true count.', 'Play every hand — deviations included.'],
    tip: 'Raise your bet only when the count is in your favor — flat-bet the rest to stay under the radar.',
  },
}
