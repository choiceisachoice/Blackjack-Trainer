import { describe, it, expect } from 'vitest'
import { loadedTrialRound, preloadTrialRound } from './trial-round-loader'
import { TrialRound } from '../trial/TrialRound'

describe('the trial round’s loader', () => {
  it('has nothing in hand until asked, then the round itself — the same one every time', async () => {
    expect(loadedTrialRound()).toBeNull()
    const first = preloadTrialRound()
    // One fetch, however many callers (the observer, the hover, the click).
    expect(preloadTrialRound()).toBe(first)
    expect(await first).toBe(TrialRound)
    expect(loadedTrialRound()).toBe(TrialRound)
  })
})
