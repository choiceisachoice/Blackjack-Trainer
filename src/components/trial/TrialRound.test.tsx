import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../services/sound-engine', () => ({
  soundEngine: new Proxy({}, { get: () => () => {} }),
}))

import { TrialRound, type TrialRoundProps } from './TrialRound'
import { useAppStore } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import { DEFAULT_RULES, Action } from '../../engine/rules/types'
import { lookupBasicAction } from '../../engine/strategy/flashcards'
import { S17_STRATEGY } from '../../engine/strategy/basic-strategy-tables'
import { GUEST_ROUND_HANDS, guestRoundSince } from '../../services/guest-trial'
import { setLocalOwner } from '../../services/storage/local-owner'

/**
 * The round as both of its hosts get it. What a visitor sees hand by hand is
 * covered where it is hosted (`pages/TryPage.test.tsx`); here are the things
 * a host can switch, and the isolation rules that must hold whichever page
 * the round is on.
 */
const open = (props: TrialRoundProps = {}) => render(<MemoryRouter><TrialRound {...props} /></MemoryRouter>)

function playAll() {
  for (let i = 0; i < GUEST_ROUND_HANDS; i++) {
    const hand = screen.getByTestId('player-hand').textContent ?? ''
    const dealer = screen.getByTestId('dealer-card').textContent ?? ''
    const right: Action = lookupBasicAction(hand, dealer, S17_STRATEGY)
    fireEvent.click(screen.getByTestId(`action-${String(right).toLowerCase()}`))
    fireEvent.click(screen.getByTestId('next-question'))
  }
}

beforeEach(() => {
  localStorage.clear()
  useAppStore.setState({ selectedRules: { ...DEFAULT_RULES, dealerHitsSoft17: false }, flashFocus: null })
  useStatsStore.setState({ sessions: [], lifetimeStats: null })
})

afterEach(cleanup)

describe('TrialRound — what a host can switch', () => {
  it('opens on the intro, without a heading unless the host asks for one', () => {
    open()
    expect(screen.getByTestId('try-intro')).toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    cleanup()
    open({ titled: true })
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('opens on the first hand when asked to, and tells the host once', () => {
    const onStart = vi.fn()
    open({ autoStart: true, onStart })
    expect(screen.queryByTestId('try-intro')).not.toBeInTheDocument()
    expect(screen.getByTestId('question-progress')).toHaveTextContent('Question 1/10')
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('tells the host when the intro’s button deals', () => {
    const onStart = vi.fn()
    open({ onStart })
    expect(onStart).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('try-start'))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('ends on the account as the one next step, with the way home only where there is one', () => {
    open({ autoStart: true })
    playAll()
    expect(within(screen.getByTestId('try-summary')).getAllByRole('link').map(a => a.getAttribute('href'))).toEqual(['/login', '/'])
    cleanup()
    localStorage.clear()

    open({ autoStart: true, homeLink: false })
    playAll()
    const summary = screen.getByTestId('try-summary')
    expect(within(summary).getAllByRole('link').map(a => a.getAttribute('href'))).toEqual(['/login'])
    expect(within(summary).queryAllByRole('button')).toHaveLength(0)
  })
})

describe('TrialRound — whose round it is', () => {
  it('stamps the round when the first hand is dealt, and records it like any session', () => {
    const recordSession = vi.fn()
    useStatsStore.setState({ recordSession })
    open()
    expect(guestRoundSince()).toBeNull()
    fireEvent.click(screen.getByTestId('try-start'))
    expect(guestRoundSince()).not.toBeNull()
    playAll()
    expect(recordSession).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('try-next')).toHaveTextContent(/keep this result/)
  })

  it('neither stamps nor records on a device that still holds an account’s data', () => {
    setLocalOwner('someone')
    const recordSession = vi.fn()
    useStatsStore.setState({ recordSession })
    const view = open({ autoStart: true })
    playAll()
    expect(screen.getByTestId('try-next')).not.toHaveTextContent(/keep this result/)
    view.unmount()
    expect(recordSession).not.toHaveBeenCalled()
    expect(guestRoundSince()).toBeNull()
  })
})
