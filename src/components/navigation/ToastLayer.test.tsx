import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ToastLayer, TOAST_LAYER } from './ToastLayer'
import { useLevelStore } from '../../store/level-store'
import { useAchievementStore } from '../../store/achievement-store'
import { ALL_ACHIEVEMENTS } from '../../services/achievements/achievement-list'

/**
 * Where the XP and award toasts land.
 *
 * jsdom has no layout, so the placement is pinned on the classes that make it.
 * Each assertion names the defect it guards against: the layer sat
 * bottom-centre, over every summary screen's main button, and was as narrow as
 * its content on a phone.
 */
const classes = TOAST_LAYER.split(/\s+/)

describe('TOAST_LAYER', () => {
  it('hangs under the header, never from the foot of the screen', () => {
    expect(classes).toContain('fixed')
    expect(classes.some(c => c.startsWith('top-'))).toBe(true)
    expect(classes.some(c => /^(md:)?bottom-/.test(c))).toBe(false)
    // Below the 3.5rem app header, not on it.
    expect(TOAST_LAYER).toMatch(/top-\[calc\(3\.5rem\+[^\]]+\)\]/)
  })

  it('is the screen width less the gutters on a phone', () => {
    expect(classes).toContain('inset-x-4')
    expect(classes).toContain('items-stretch')
    // The old centring trick made the column only as wide as its words.
    expect(classes).not.toContain('-translate-x-1/2')
  })

  it('moves to the top right from md, at a fixed width', () => {
    expect(classes).toContain('md:left-auto')
    expect(classes).toContain('md:right-6')
    expect(classes.some(c => /^md:w-\[\d+(\.\d+)?rem\]$/.test(c))).toBe(true)
  })

  it('never takes clicks meant for the page under it', () => {
    expect(classes).toContain('pointer-events-none')
  })
})

describe('ToastLayer', () => {
  beforeEach(() => {
    useLevelStore.setState({ lastAward: null, showLevelUp: false, levelUpData: null })
    useAchievementStore.setState({ newlyUnlocked: [] })
  })

  it('stacks the XP toast above the award when both arrive', () => {
    useLevelStore.setState({
      lastAward: { amount: 40, labelKey: 'xp.source.session', id: 1, parts: [{ labelKey: 'xp.source.session', amount: 40 }], at: Date.now() },
      showLevelUp: false,
    })
    useAchievementStore.setState({ newlyUnlocked: [ALL_ACHIEVEMENTS[0]] })
    render(<ToastLayer />)
    const layer = screen.getByTestId('toast-layer')
    const xp = screen.getByTestId('xp-toast')
    const award = screen.getByTestId('achievement-toast')
    expect(layer.contains(xp) && layer.contains(award)).toBe(true)
    // Document order is stacking order in a flex column.
    expect(xp.compareDocumentPosition(award) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('draws nothing of its own when there is nothing to announce', () => {
    render(<ToastLayer />)
    expect(screen.getByTestId('toast-layer').childElementCount).toBe(0)
  })
})
