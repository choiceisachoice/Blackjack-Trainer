import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { LevelUpPopup } from './LevelUpPopup'
import { useLevelStore } from '../../store/level-store'
import { LEVELS } from '../../services/level-system'

/**
 * Reduced motion: the level-up simply appears, settled.
 *
 * Its own file because `useReducedMotion` reads the media query once per
 * module and caches it (see `common/reduced-motion-off.test.tsx`).
 *
 * "Settled" is the point, not "shorter". The global reset in `index.css`
 * shortens every animation to 0.01 ms but leaves its delay, and parts of this
 * card wait up to 560 ms for their turn — so merely shortened, the title and
 * the tier would sit invisible for half a second and then pop in. Here there
 * is no animation to shorten: every keyframe is `from`-only, so without one
 * the element is already where it belongs.
 */
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
  localStorage.clear()
  useLevelStore.setState({
    showLevelUp: true,
    levelUpData: {
      oldLevel: LEVELS[4],
      newLevel: LEVELS[6], // 5 → 7: a jump, and a tier change
      breakdown: [{ labelKey: 'xp.source.session', amount: 75 }],
    },
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useLevelStore.setState({ showLevelUp: false, levelUpData: null })
})

describe('LevelUpPopup with reduced motion requested', () => {
  it('declares no animation anywhere', () => {
    render(<LevelUpPopup />)
    const popup = screen.getByTestId('level-up-popup')
    const animated = [popup, ...popup.querySelectorAll<HTMLElement>('*')].filter(el => el.style.animation)
    expect(animated).toEqual([])
  })

  it('draws no sparks, pulse or light sweep', () => {
    render(<LevelUpPopup />)
    expect(screen.getByTestId('level-up-popup').querySelectorAll('.lu-fx')).toHaveLength(0)
  })

  it('shows the number at the new level, not rolling towards it', () => {
    render(<LevelUpPopup />)
    // Two levels gained: the strip rests two rows up, on the 7.
    expect(screen.getByTestId('level-up-roll').style.transform).toBe('translateY(-2.5em)')
  })

  it('still shows the tier change, just without the sweep', () => {
    render(<LevelUpPopup />)
    expect(screen.getByTestId('level-up-tier-change')).toHaveTextContent('Intermediate')
  })
})
