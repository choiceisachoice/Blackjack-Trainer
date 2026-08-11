import React from 'react'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * What the player is asked when they come back to a paused session.
 *
 * Returning is not the same situation as pausing on purpose. Someone who hit
 * pause wants Resume and Quit. Someone returning after ten minutes in another
 * mode first has to be told the session is still there — the old behaviour
 * destroyed it, so that expectation has to be actively corrected — and then be
 * given the choice they would otherwise reach by quitting: start fresh.
 *
 * Quitting is not that choice. It ends the session and books it into the
 * statistics and the tracker as a completed one, which half a shoe played
 * before wandering off is not.
 */

const setPaused = vi.fn<(v: boolean) => void>()
const quitSession = vi.fn()

let paused = true
let handNum = 7

vi.mock('./useGameLoop', () => ({
  useGameLoop: () => ({
    state: {
      isPaused: paused,
      gameStep: 'betting',
      seats: [],
      humanHands: [[]],
      currentBet: 0,
      humanVisibleCards: 0,
      botVisibleCards: {},
      activeHandIndex: 0,
      handDoubled: new Set<number>(),
      isSurrendered: false,
      showReshuffle: false,
      showInsurance: false,
      settlementMsg: '',
      humanSettlement: null,
      rcInput: '',
      tcInput: '',
      countFeedback: null,
      handReview: null,
      botStatuses: {},
      botActiveSplitHands: {},
      botSplitVisibleCards: {},
      elapsedSeconds: 0,
    },
    actions: {
      setPaused, quitSession,
      confirmBet: vi.fn(), handleAction: vi.fn(), handleInsurance: vi.fn(),
      submitCount: vi.fn(), nextHand: vi.fn(), setBet: vi.fn(),
      setRcInput: vi.fn(), setTcInput: vi.fn(),
    },
    seatLayout: [], shoeProgress: 0, cardsRemaining: 100, cardsDealt: 0,
    totalCards: 312, bankroll: 1000, handNum, discardCount: 0,
    initSession: vi.fn(),
  }),
}))

// The table itself is irrelevant here and enormous.
vi.mock('./CasinoTable', () => ({ CasinoTable: () => <div /> }))
vi.mock('framer-motion', () => {
  const motion = new Proxy({}, {
    get: (_t, tag: string) =>
      ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
        const { initial, animate, exit, transition, ...rest } = props
        void initial; void animate; void exit; void transition
        return React.createElement(tag, rest, children)
      },
  })
  return { motion, AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</> }
})

import { CasinoSessionGame } from './CasinoSessionGame'
import { DEFAULT_CONFIG } from './helpers'

const onRestart = vi.fn()

function show(backgrounded: boolean) {
  return render(
    <CasinoSessionGame
      config={DEFAULT_CONFIG}
      recorder={null}
      soundEnabled={false}
      onSessionEnd={vi.fn()}
      backgrounded={backgrounded}
      onRestart={onRestart}
    />,
  )
}

beforeEach(() => {
  paused = true
  handNum = 7
  setPaused.mockClear()
  quitSession.mockClear()
  onRestart.mockClear()
})
afterEach(cleanup)

describe('coming back from another mode', () => {
  it('says the session survived, rather than leaving them to guess', () => {
    const { rerender } = show(true)
    rerender(
      <CasinoSessionGame config={DEFAULT_CONFIG} recorder={null} soundEnabled={false}
        onSessionEnd={vi.fn()} backgrounded={false} onRestart={onRestart} />,
    )

    expect(screen.getByTestId('resume-session-panel')).toBeInTheDocument()
    expect(screen.getByTestId('resume-session-panel')).toHaveTextContent(/still here/i)
  })

  it('says where the session stands, so continuing is an informed choice', () => {
    const { rerender } = show(true)
    rerender(
      <CasinoSessionGame config={DEFAULT_CONFIG} recorder={null} soundEnabled={false}
        onSessionEnd={vi.fn()} backgrounded={false} onRestart={onRestart} />,
    )
    expect(screen.getByTestId('resume-session-panel')).toHaveTextContent(/hand 7/i)
  })

  it('resumes on "continue" — here the player is looking, so it is safe', () => {
    const { rerender } = show(true)
    rerender(
      <CasinoSessionGame config={DEFAULT_CONFIG} recorder={null} soundEnabled={false}
        onSessionEnd={vi.fn()} backgrounded={false} onRestart={onRestart} />,
    )

    fireEvent.click(screen.getByTestId('resume-continue'))
    expect(setPaused).toHaveBeenCalledWith(false)
  })

  it('offers a fresh shoe without booking the abandoned one as a result', () => {
    const { rerender } = show(true)
    rerender(
      <CasinoSessionGame config={DEFAULT_CONFIG} recorder={null} soundEnabled={false}
        onSessionEnd={vi.fn()} backgrounded={false} onRestart={onRestart} />,
    )

    fireEvent.click(screen.getByTestId('resume-restart'))
    expect(onRestart).toHaveBeenCalledOnce()
    // Quitting would have recorded an unfinished session in the statistics.
    expect(quitSession).not.toHaveBeenCalled()
  })

  it('asks once, not on every later pause', () => {
    const { rerender } = show(true)
    const back = (bg: boolean) => rerender(
      <CasinoSessionGame config={DEFAULT_CONFIG} recorder={null} soundEnabled={false}
        onSessionEnd={vi.fn()} backgrounded={bg} onRestart={onRestart} />,
    )
    back(false)
    fireEvent.click(screen.getByTestId('resume-continue'))
    back(false)

    expect(screen.queryByTestId('resume-session-panel')).toBeNull()
  })
})

describe('pausing on purpose', () => {
  it('keeps the plain panel — Resume and Quit, no talk of coming back', () => {
    show(false)
    expect(screen.queryByTestId('resume-session-panel')).toBeNull()
    expect(screen.getByTestId('quit-session')).toBeInTheDocument()
  })
})
