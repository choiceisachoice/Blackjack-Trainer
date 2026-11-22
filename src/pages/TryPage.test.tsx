import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

/**
 * The trial round as a visitor meets it. Supabase is "configured" here and
 * the auth store is a stand-in, because the page's two decisions — who may
 * play, and whether the round is kept — only exist with accounts.
 */
const auth = vi.hoisted(() => ({ status: 'signedOut' as string }))
vi.mock('../store/auth-store', () => ({
  useAuthStore: Object.assign(
    () => auth.status,
    { getState: () => ({ status: auth.status, user: null }), setState: vi.fn() },
  ),
  isSupabaseConfigured: true,
}))
vi.mock('../services/sound-engine', () => ({
  // Every sound the round can make — an answer, a streak, the level reached
  // with the first session's XP — as a no-op.
  soundEngine: new Proxy({}, { get: () => () => {} }),
}))

import { TryPage } from './TryPage'
import { useAppStore } from '../store/app-store'
import { useStatsStore } from '../store/stats-store'
import { DEFAULT_RULES, Action } from '../engine/rules/types'
import { lookupBasicAction } from '../engine/strategy/flashcards'
import { S17_STRATEGY } from '../engine/strategy/basic-strategy-tables'
import { GUEST_ROUND_HANDS, guestRoundSince } from '../services/guest-trial'
import { setLocalOwner } from '../services/storage/local-owner'

function Where() {
  const { pathname, state } = useLocation()
  return <span data-testid="where" data-state={JSON.stringify(state)}>{pathname}</span>
}

function open(state: unknown = null) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/try', state }]}>
      <Routes>
        <Route path="/try" element={<TryPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** The play basic strategy makes for the hand on screen (S17, set below). */
function rightPlay(): Action {
  const hand = screen.getByTestId('player-hand').textContent ?? ''
  const dealer = screen.getByTestId('dealer-card').textContent ?? ''
  return lookupBasicAction(hand, dealer, S17_STRATEGY)
}

const click = (action: Action) => fireEvent.click(screen.getByTestId(`action-${String(action).toLowerCase()}`))

/** Answer every hand; `wrongOn` lists the hands (0-based) to get wrong. Returns what was missed. */
function play(wrongOn: number[] = []) {
  const missed: { hand: string; dealer: string }[] = []
  for (let i = 0; i < GUEST_ROUND_HANDS; i++) {
    const right = rightPlay()
    if (wrongOn.includes(i)) {
      missed.push({
        hand: screen.getByTestId('player-hand').textContent ?? '',
        dealer: screen.getByTestId('dealer-card').textContent ?? '',
      })
      click(right === Action.Hit ? Action.Stand : Action.Hit)
    } else {
      click(right)
    }
    fireEvent.click(screen.getByTestId('next-question'))
  }
  return missed
}

beforeEach(() => {
  auth.status = 'signedOut'
  localStorage.clear()
  useAppStore.setState({ selectedRules: { ...DEFAULT_RULES, dealerHitsSoft17: false }, flashFocus: null })
  useStatsStore.setState({ sessions: [], lifetimeStats: null })
})

afterEach(cleanup)

describe('TryPage — the first screen', () => {
  it('says what this is and offers one way to begin', () => {
    open()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Play a round of basic strategy')
    expect(screen.getByTestId('try-intro')).toHaveTextContent('10 hands')
    expect(screen.getByTestId('try-start')).toBeInTheDocument()
    // None of the setup an account holder gets: no levels, no deviations.
    expect(screen.queryByTestId('start-training')).not.toBeInTheDocument()
    expect(screen.queryByText('Deviations')).not.toBeInTheDocument()
  })

  it('has its own title, description and canonical', () => {
    open()
    expect(document.title).toMatch(/basic strategy/i)
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://black-jack-training.com/try')
  })

  it('opens on the first hand when the visitor arrives from the landing’s button', () => {
    open({ autoStart: true })
    expect(screen.queryByTestId('try-intro')).not.toBeInTheDocument()
    expect(screen.getByTestId('question-progress')).toHaveTextContent('Question 1/10')
    // The round is stamped although no start button was pressed.
    expect(guestRoundSince()).not.toBeNull()
  })

  it('does not repeat the shell’s closing call to action — the page asks once, at the end', () => {
    open()
    expect(screen.queryByText('Ready to make the count automatic?')).not.toBeInTheDocument()
  })
})

describe('TryPage — the round', () => {
  it('is ten basic-strategy hands, with no count to know', () => {
    open()
    fireEvent.click(screen.getByTestId('try-start'))
    expect(screen.getByTestId('question-progress')).toHaveTextContent('Question 1/10')
    expect(screen.queryByTestId('true-count')).not.toBeInTheDocument()
  })

  it('asks for nothing while it is being played', () => {
    open()
    fireEvent.click(screen.getByTestId('try-start'))
    click(rightPlay())
    expect(screen.queryByTestId('try-signup')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('TryPage — the end', () => {
  it('shows the score and each missed hand with the play that was right', () => {
    open()
    fireEvent.click(screen.getByTestId('try-start'))
    const missed = play([1, 6])

    expect(screen.getByTestId('try-score')).toHaveTextContent('8/10')
    expect(screen.getByTestId('try-summary')).toHaveTextContent('8 of 10 hands played right')
    const rows = within(screen.getByTestId('try-misses')).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    missed.forEach((m, i) => {
      expect(rows[i]).toHaveTextContent(`${m.hand} vs. ${m.dealer}`)
      const right = lookupBasicAction(m.hand, m.dealer, S17_STRATEGY)
      const label = { [Action.Hit]: 'Hit', [Action.Stand]: 'Stand', [Action.Double]: 'Double', [Action.Split]: 'Split', [Action.Surrender]: 'Surrender' }[right as string]
      expect(within(rows[i]).getAllByRole('cell')[1]).toHaveTextContent(label ?? '')
    })
  })

  it('says so when nothing was missed, instead of an empty table', () => {
    open()
    fireEvent.click(screen.getByTestId('try-start'))
    play()
    expect(screen.getByTestId('try-score')).toHaveTextContent('10/10')
    expect(screen.getByTestId('try-perfect')).toBeInTheDocument()
    expect(screen.queryByTestId('try-misses')).not.toBeInTheDocument()
  })

  it('offers one next step — the account, on the register side — and a quiet way home', () => {
    open()
    fireEvent.click(screen.getByTestId('try-start'))
    play()
    const summary = screen.getByTestId('try-summary')
    const links = within(summary).getAllByRole('link')
    expect(links.map(a => a.getAttribute('href'))).toEqual(['/login', '/'])
    expect(within(summary).queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByTestId('try-next')).toHaveTextContent(/keep this result/)

    fireEvent.click(screen.getByTestId('try-signup'))
    expect(screen.getByTestId('where')).toHaveTextContent('/login')
    expect(screen.getByTestId('where').dataset.state).toBe(JSON.stringify({ mode: 'signup' }))
  })

  it('records the round through the ordinary session recording', () => {
    const recordSession = vi.fn()
    useStatsStore.setState({ recordSession })
    open()
    fireEvent.click(screen.getByTestId('try-start'))
    play([0])
    expect(recordSession).toHaveBeenCalledTimes(1)
    expect(recordSession.mock.calls[0][0]).toMatchObject({
      mode: 'deviationFlashCards', totalQuestions: 10, correctAnswers: 9,
    })
  })
})

describe('TryPage — who it is not for', () => {
  it('sends a signed-in visitor to the app', () => {
    auth.status = 'signedIn'
    open()
    expect(screen.getByTestId('where')).toHaveTextContent('/app')
  })

  it('lets a round already on screen end when the session turns out to be signed in', () => {
    // Auth resolves a moment after the page: the redirect must not record a
    // half-played round as anybody's.
    const recordSession = vi.fn()
    useStatsStore.setState({ recordSession })
    const view = open({ autoStart: true })
    click(rightPlay())
    auth.status = 'signedIn'
    view.rerender(
      <MemoryRouter initialEntries={['/try']}>
        <Routes>
          <Route path="/try" element={<TryPage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('where')).toHaveTextContent('/app')
    // One answer is below the threshold for a session.
    expect(recordSession).not.toHaveBeenCalled()
  })

  it('plays without recording where an account’s data is still on the device, and promises nothing', () => {
    setLocalOwner('someone')
    const recordSession = vi.fn()
    useStatsStore.setState({ recordSession })
    const view = open()
    fireEvent.click(screen.getByTestId('try-start'))
    play([2])
    expect(screen.getByTestId('try-score')).toHaveTextContent('9/10')
    expect(screen.getByTestId('try-next')).not.toHaveTextContent(/keep this result/)
    expect(screen.getByTestId('try-next')).toHaveTextContent(/training plan/)
    view.unmount()
    expect(recordSession).not.toHaveBeenCalled()
    expect(guestRoundSince()).toBeNull()
  })
})
