import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import React from 'react'
import { CasinoSession } from './CasinoSession'
import { useAppStore } from '../../store/app-store'
import { useCasinoSessionTrackerStore } from '../../store/casino-session-tracker-store'
import { Shoe } from '../../engine/shoe/shoe'
import { Rank, Suit, type Card } from '../../engine/shoe/types'

vi.mock('framer-motion', async () => {
  const strip = (props: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(props).filter(([k]) => k.startsWith('data-') || ['className', 'style', 'onClick', 'id'].includes(k)))
  return {
    motion: new Proxy({}, {
      get: (_t, tag: string) => ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement(tag, strip(p), children),
    }),
    AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
    MotionConfig: ({ children }: React.PropsWithChildren) => <>{children}</>,
    LayoutGroup: ({ children }: React.PropsWithChildren) => <>{children}</>,
    useReducedMotion: () => false,
    useAnimationControls: () => ({ set: () => {}, start: () => {} }),
  }
})
vi.mock('../../services/casino-ambient', () => ({
  casinoAmbient: { start: vi.fn(), stop: vi.fn(), playing: false, volume: 0.15 },
}))
vi.mock('../table/ShoeProgress', () => ({ ShoeHousing: () => <div />, DiscardTray: () => <div /> }))
vi.mock('../../services/sound-engine', () => ({
  soundEngine: new Proxy({ enabled: false, volume: 0 }, { get: (t, k) => (k in t ? t[k as keyof typeof t] : () => {}) }),
}))
vi.mock('../../store/level-store', () => ({
  useLevelStore: { getState: () => ({ addSessionXP: vi.fn(), addChallengeXP: vi.fn(), addAchievementXP: vi.fn(), addAchievementsXP: vi.fn() }) },
}))
vi.mock('./helpers', async importOriginal => ({ ...(await importOriginal<typeof import('./helpers')>()), DECISION_SECONDS: 1_000_000 }))

const c = (rank: Rank, suit: Suit = Suit.Hearts): Card => ({ rank, suit })
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

/**
 * The review after a hand looks at every decision of the hand.
 *
 * Audit, 18 Nov 2026: a hard 18 hit into a bust was reviewed as "Play:
 * correct" — only the first decision was read, and the first hit (on 8) had
 * been right.
 */
describe('the hand review', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useAppStore.getState().setMode('casinoSession')
    useAppStore.setState({ dealingSpeed: 'fast' })
    useCasinoSessionTrackerStore.setState({ sessions: [], startingBankroll: 0 })
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  /** Player 5,3 against a 9; then a ten (18), then a two (20). Dealer 9,7 draws a five. */
  function deal() {
    const seq = [c(Rank.Five), c(Rank.Nine, Suit.Clubs), c(Rank.Three, Suit.Spades), c(Rank.Seven, Suit.Diamonds),
      c(Rank.Ten), c(Rank.Two, Suit.Clubs), c(Rank.Five, Suit.Spades), c(Rank.Four), c(Rank.Six), c(Rank.Eight)]
    let n = 0
    vi.spyOn(Shoe.prototype, 'deal').mockImplementation(() => seq[n++ % seq.length])
    render(<CasinoSession />)
    fireEvent.click(within(screen.getByRole('group', { name: 'Bots at the table' })).getByRole('button', { name: '0' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Session Length' })).getByRole('button', { name: 'Unlimited' }))
    fireEvent.click(screen.getByTestId('start-session'))
    tick(100)
    fireEvent.click(screen.getByText('+$25'))
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(8000)
  }

  /** Step from the settled round to the review, past a count check if one is asked. */
  function toReview() {
    tick(20_000)
    for (let i = 0; i < 4 && !screen.queryByTestId('hand-review'); i++) {
      const next = screen.queryByTestId('next-hand')
      if (next) fireEvent.click(next)
      const submit = screen.queryByTestId('submit-count')
      if (submit) fireEvent.click(submit)
      tick(6000)
    }
  }

  it('calls a hand wrong when a later decision was wrong, and names what was right', () => {
    deal()
    fireEvent.click(screen.getByTestId('action-hit'))   // 8 against 9: right
    tick(3000)
    fireEvent.click(screen.getByTestId('action-hit'))   // hard 18 against 9: wrong
    tick(3000)
    if (screen.queryByTestId('action-stand')) fireEvent.click(screen.getByTestId('action-stand'))
    toReview()
    const play = screen.getByTestId('review-play')
    expect(play).toHaveAttribute('data-correct', 'false')
    expect(play.textContent).toMatch(/stand/i)
  })

  it('calls a hand correct when every decision was', () => {
    deal()
    fireEvent.click(screen.getByTestId('action-hit'))   // 8 against 9: right
    tick(3000)
    fireEvent.click(screen.getByTestId('action-stand')) // 18 against 9: right
    toReview()
    expect(screen.getByTestId('review-play')).toHaveAttribute('data-correct', 'true')
  })
})
