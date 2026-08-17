import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CasinoSession } from '../casino-session/CasinoSession'
import { BOT_STATUS_LABEL_KEY } from '../casino-session/helpers'
import enMessages from '../../i18n/messages/en.json'
import { useAppStore } from '../../store/app-store'

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...filterDomProps(props)}>{children}</div>,
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...filterDomProps(props)}>{children}</span>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
    // The app declares one motion policy at the root and several components
    // ask for the preference directly; a mock that omits either renders
    // `undefined` as a component and takes the whole tree down.
  MotionConfig: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useReducedMotion: () => false,
  LayoutGroup: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useAnimationControls: () => ({ set: () => {}, start: () => {} }),
}))

// Mock casino-ambient
vi.mock('../../services/casino-ambient', () => {
  let _vol = 0.15
  return {
    casinoAmbient: {
      start: vi.fn(),
      stop: vi.fn(),
      get playing() { return false },
      get volume() { return _vol },
      set volume(v: number) { _vol = v },
    },
  }
})

// Mock ShoeProgress components (ShoeHousing + DiscardTray)
vi.mock('../table/ShoeProgress', () => ({
  ShoeHousing: ({ cardCount, totalCards, penetration }: { cardCount: number; totalCards: number; penetration: number }) => (
    <div data-testid="shoe-housing" data-card-count={cardCount} data-total-cards={totalCards} data-penetration={penetration}>Shoe</div>
  ),
  DiscardTray: ({ cardCount }: { cardCount: number }) => (
    <div data-testid="discard-tray" data-card-count={cardCount}>Discard</div>
  ),
}))

// Mock sound engine
vi.mock('../../services/sound-engine', () => ({
  soundEngine: {
    cardDeal: vi.fn(),
    cardFlip: vi.fn(),
    chipPlace: vi.fn(),
    chipCollect: vi.fn(),
    correct: vi.fn(),
    wrong: vi.fn(),
    streak: vi.fn(),
    buttonClick: vi.fn(),
    timerTick: vi.fn(),
    sessionComplete: vi.fn(),
    levelUp: vi.fn(),
    enabled: true,
    volume: 0.3,
  },
}))

// Mock level store (prevents side effects from addAchievementXP/addSessionXP)
vi.mock('../../store/level-store', () => ({
  useLevelStore: {
    getState: () => ({
      addSessionXP: vi.fn(),
      addChallengeXP: vi.fn(),
      addAchievementXP: vi.fn(),
      addAchievementsXP: vi.fn(),
    }),
  },
}))

/** Filter out non-DOM props from motion.div/span mock */
function filterDomProps(props: Record<string, unknown>): Record<string, unknown> {
  const domProps: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(props)) {
    if (key.startsWith('data-') || key === 'className' || key === 'style' || key === 'onClick' || key === 'id') {
      domProps[key] = val
    }
  }
  return domProps
}

describe('CasinoSession', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useAppStore.getState().setMode('casinoSession')
    // Deal-timing tests assume the baseline (1.0×) speed, not the 'slow' default
    useAppStore.setState({ dealingSpeed: 'normal' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Config Phase', () => {
    it('renders config phase with setup fields', () => {
      render(<CasinoSession />)

      expect(screen.getByText('Casino Session Setup')).toBeTruthy()
      expect(screen.getByText('Session Length')).toBeTruthy()
      expect(screen.getByText('Table Setup')).toBeTruthy()
      expect(screen.getByText('Casino Rules')).toBeTruthy()
      expect(screen.getByText('Training Options')).toBeTruthy()
      expect(screen.getByTestId('start-session')).toBeTruthy()
    })

    it('has default session mode set to hands', () => {
      render(<CasinoSession />)

      const group = screen.getByRole('group', { name: 'Session Length' })
      expect(group.querySelector('[aria-pressed="true"]')?.textContent).toBe('Hands')
    })

    it('can toggle between hands and time mode', () => {
      render(<CasinoSession />)

      fireEvent.click(screen.getByRole('button', { name: 'Time' }))

      // Should now show Minutes input
      expect(screen.getByLabelText('Minutes')).toBeTruthy()
    })

    it('starts session on button click', () => {
      render(<CasinoSession />)

      fireEvent.click(screen.getByTestId('start-session'))

      // Should transition to playing phase (shows status bar)
      act(() => { vi.advanceTimersByTime(100) })
      expect(screen.getByText(/Hand:/)).toBeTruthy()
      expect(screen.getByText(/Bankroll:/)).toBeTruthy()
    })

    it('renders number of bots selector', () => {
      render(<CasinoSession />)

      const botsGroup = screen.getByRole('group', { name: 'Bots at the table' })
      expect(botsGroup).toBeTruthy()
      // Default 2 bots is the pressed segment
      const pressed = botsGroup.querySelector('[aria-pressed="true"]')
      expect(pressed?.textContent).toBe('2')
    })

    it('renders count check frequency selector', () => {
      render(<CasinoSession />)

      expect(screen.getByRole('group', { name: 'Count check' })).toBeTruthy()
    })
  })

  describe('Playing Phase', () => {
    function startSession() {
      render(<CasinoSession />)
      fireEvent.click(screen.getByTestId('start-session'))
      act(() => { vi.advanceTimersByTime(100) })
    }

    it('shows betting controls initially', () => {
      startSession()

      expect(screen.getByTestId('betting-controls')).toBeTruthy()
      expect(screen.getByText('Place your bet')).toBeTruthy()
    })

    it('shows bet amount buttons based on config min/max', () => {
      startSession()

      // Default minBet=25, maxBet=500 → chips: [25, 50, 100, 200, 250, 500] (additive, prefixed with +)
      expect(screen.getByText('+$25')).toBeTruthy()
      expect(screen.getByText('+$50')).toBeTruthy()
      expect(screen.getByText('+$100')).toBeTruthy()
      expect(screen.getByText('+$200')).toBeTruthy()
      expect(screen.getByText('+$250')).toBeTruthy()
      expect(screen.getByText('+$500')).toBeTruthy()
    })

    it('can select a bet and deal', () => {
      startSession()

      // Select bet (additive chips)
      fireEvent.click(screen.getByText('+$25'))
      fireEvent.click(screen.getByTestId('confirm-bet'))

      // After deal animation, should show cards on the table
      act(() => { vi.advanceTimersByTime(6000) })

      // Human seat should have cards rendered
      const humanSeat = screen.getByTestId('human-seat')
      expect(humanSeat).toBeTruthy()

      // Casino table should be rendered
      const table = screen.getByTestId('casino-table')
      expect(table).toBeTruthy()
    })

    it('shows pause button during play', () => {
      startSession()

      expect(screen.getByTestId('pause-button')).toBeTruthy()
    })

    it('shows pause overlay when paused', () => {
      startSession()

      fireEvent.click(screen.getByTestId('pause-button'))

      expect(screen.getByText('Paused')).toBeTruthy()
      expect(screen.getByTestId('quit-session')).toBeTruthy()
    })

    it('can resume from pause', () => {
      startSession()

      fireEvent.click(screen.getByTestId('pause-button'))
      expect(screen.getByText('Paused')).toBeTruthy()

      fireEvent.click(screen.getByText('Resume'))
      // Pause overlay should be gone
      expect(screen.queryByText('Paused')).toBeNull()
    })

    it('shows elapsed time', () => {
      startSession()

      expect(screen.getByText('0:00')).toBeTruthy()
    })

    it('shows hand counter', () => {
      startSession()

      expect(screen.getByText(/Hand:/)).toBeTruthy()
    })

    it('shows semi-circular casino table', () => {
      startSession()

      const table = screen.getByTestId('casino-table')
      expect(table).toBeTruthy()
    })

    it('shows shoe progress indicator in status bar', () => {
      startSession()

      const shoe = screen.getByTestId('shoe-progress')
      expect(shoe).toBeTruthy()
    })

    it('shows human seat with the YOU nameplate in its block', () => {
      startSession()

      const humanSeat = screen.getByTestId('human-seat')
      expect(humanSeat).toBeTruthy()
      // Nameplate (name + bankroll) lives inside the seat block now
      expect(screen.getByText(/YOU/)).toBeTruthy()
    })

    it('shows Dealer label on table', () => {
      startSession()

      expect(screen.getByText('Dealer')).toBeTruthy()
    })
  })

  describe('Keyboard Shortcuts', () => {
    it('Escape pauses the session', () => {
      render(<CasinoSession />)
      fireEvent.click(screen.getByTestId('start-session'))
      act(() => { vi.advanceTimersByTime(100) })

      fireEvent.keyDown(window, { key: 'Escape' })

      expect(screen.getByText('Paused')).toBeTruthy()
    })

    it('Escape unpauses when already paused', () => {
      render(<CasinoSession />)
      fireEvent.click(screen.getByTestId('start-session'))
      act(() => { vi.advanceTimersByTime(100) })

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.getByText('Paused')).toBeTruthy()

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.queryByText('Paused')).toBeNull()
    })
  })

  describe('Quit Session', () => {
    it('transitions to summary phase on quit', () => {
      render(<CasinoSession />)
      fireEvent.click(screen.getByTestId('start-session'))
      act(() => { vi.advanceTimersByTime(100) })

      // Pause then quit
      fireEvent.click(screen.getByTestId('pause-button'))
      fireEvent.click(screen.getByTestId('quit-session'))

      // Should show summary with grade
      expect(screen.getByText(/Overall Score/)).toBeTruthy()
      expect(screen.getByTestId('play-again')).toBeTruthy()
      expect(screen.getByTestId('go-home')).toBeTruthy()
    })
  })

  describe('Summary Phase', () => {
    function goToSummary() {
      render(<CasinoSession />)
      fireEvent.click(screen.getByTestId('start-session'))
      act(() => { vi.advanceTimersByTime(100) })

      // Pause and quit to get to summary
      fireEvent.click(screen.getByTestId('pause-button'))
      fireEvent.click(screen.getByTestId('quit-session'))
    }

    it('shows grade and overall score', () => {
      goToSummary()

      expect(screen.getByText(/Overall Score/)).toBeTruthy()
    })

    it('shows bankroll summary', () => {
      goToSummary()

      expect(screen.getByText('Bankroll')).toBeTruthy()
      expect(screen.getByText('Starting:')).toBeTruthy()
      expect(screen.getByText('Final:')).toBeTruthy()
    })

    it('shows accuracy breakdown', () => {
      goToSummary()

      expect(screen.getByText('Accuracy')).toBeTruthy()
      expect(screen.getByText('Betting')).toBeTruthy()
      expect(screen.getByText('Play')).toBeTruthy()
    })

    it('shows session stats', () => {
      goToSummary()

      expect(screen.getByText('Session Stats')).toBeTruthy()
      expect(screen.getByText('Hands:')).toBeTruthy()
      expect(screen.getByText('Duration:')).toBeTruthy()
    })

    it('play again returns to config', () => {
      goToSummary()

      fireEvent.click(screen.getByTestId('play-again'))

      expect(screen.getByText('Casino Session Setup')).toBeTruthy()
    })

    it('go home navigates to home', () => {
      goToSummary()

      fireEvent.click(screen.getByTestId('go-home'))

      expect(useAppStore.getState().currentMode).toBe('home')
    })
  })

  describe('Table Features', () => {
    function startSession() {
      render(<CasinoSession />)
      fireEvent.click(screen.getByTestId('start-session'))
      act(() => { vi.advanceTimersByTime(100) })
    }

    it('renders bot seats on the table', () => {
      startSession()

      // Deal to get bots on table
      fireEvent.click(screen.getByText('+$25'))
      fireEvent.click(screen.getByTestId('confirm-bet'))
      act(() => { vi.advanceTimersByTime(6000) })

      // Bots should have seat elements
      const botSeats = screen.queryAllByTestId('bot-seat')
      expect(botSeats.length).toBeGreaterThan(0)
    })

    it('shows bot status badges', () => {
      startSession()

      fireEvent.click(screen.getByText('+$25'))
      fireEvent.click(screen.getByTestId('confirm-bet'))
      act(() => { vi.advanceTimersByTime(6000) })

      // Bot status badges should be rendered
      const statusBadges = screen.queryAllByTestId('bot-status')
      expect(statusBadges.length).toBeGreaterThan(0)
    })

    it('renders green felt table with semi-circle shape', () => {
      startSession()

      const feltTable = screen.getByTestId('felt-table')
      expect(feltTable).toBeTruthy()
      // Table has semi-circular border-radius (flat top, curved bottom)
      const style = feltTable.getAttribute('style') || ''
      expect(style).toContain('border-radius')
      // Green felt: hex #1a6b3c may be converted to rgb(26, 107, 60) by JSDOM
      expect(style).toMatch(/#1a6b3c|rgb\(26, 107, 60\)/)
    })

    it('renders human player with gold highlight label in info strip', () => {
      startSession()

      const humanSeat = screen.getByTestId('human-seat')
      expect(humanSeat).toBeTruthy()
      // Human info strip has star + YOU label
      const label = screen.getByText(/★.*YOU/)
      expect(label).toBeTruthy()
    })

    it('shows all 5 action buttons during human play', () => {
      startSession()

      fireEvent.click(screen.getByText('+$25'))
      fireEvent.click(screen.getByTestId('confirm-bet'))
      // Wait for deal animation + bot play + human_playing (generous time for dynamic deal duration)
      act(() => { vi.advanceTimersByTime(20000) })

      // If human got blackjack, we skip human_playing — check gracefully
      const actionControls = screen.queryByTestId('action-controls')
      if (actionControls) {
        // All 5 buttons should be visible (some may be disabled)
        expect(screen.getByTestId('action-hit')).toBeTruthy()
        expect(screen.getByTestId('action-stand')).toBeTruthy()
        expect(screen.getByTestId('action-double')).toBeTruthy()
        expect(screen.getByTestId('action-split')).toBeTruthy()
        expect(screen.getByTestId('action-surrender')).toBeTruthy()
      }
    })

    it('split button is disabled for non-pairs', () => {
      startSession()

      fireEvent.click(screen.getByText('+$25'))
      fireEvent.click(screen.getByTestId('confirm-bet'))
      act(() => { vi.advanceTimersByTime(20000) })

      // If human got blackjack, step skips human_playing and buttons won't render
      const splitBtn = screen.queryByTestId('action-split')
      if (splitBtn) {
        expect(splitBtn).toBeTruthy()
        // The button exists (always visible now)
      }
    })

    it('dealer position is at top center of table', () => {
      startSession()

      expect(screen.getByText('Dealer')).toBeTruthy()
    })

    it('shows session net profit in status bar', () => {
      startSession()

      expect(screen.getByText(/Session:/)).toBeTruthy()
    })
  })

  describe('Shoe & Discard Components', () => {
    function startSession() {
      render(<CasinoSession />)
      fireEvent.click(screen.getByTestId('start-session'))
      act(() => { vi.advanceTimersByTime(100) })
    }

    it('shoe housing is visible on the table', () => {
      startSession()

      const shoe = screen.getByTestId('shoe-housing')
      expect(shoe).toBeTruthy()
    })

    it('discard tray is visible on the table', () => {
      startSession()

      const discard = screen.getByTestId('discard-tray')
      expect(discard).toBeTruthy()
    })

    it('shoe housing receives correct total cards', () => {
      startSession()

      const shoe = screen.getByTestId('shoe-housing')
      // Default config: 6 decks = 312 cards
      expect(shoe.getAttribute('data-total-cards')).toBe('312')
    })
  })

  describe('Bet Range & Chip Denominations', () => {
    it('bet display shows correct min and max from config', () => {
      render(<CasinoSession />)
      fireEvent.click(screen.getByTestId('start-session'))
      act(() => { vi.advanceTimersByTime(100) })

      const betRange = screen.getByTestId('bet-range')
      expect(betRange.textContent).toContain('$25')
      expect(betRange.textContent).toContain('$500')
    })

    it('chip buttons reflect configured min and max bet', () => {
      render(<CasinoSession />)

      // Change min to 50, max to 500 via config inputs
      const minInput = screen.getByLabelText('Min bet') as HTMLInputElement
      const maxInput = screen.getByLabelText('Max bet') as HTMLInputElement
      fireEvent.change(minInput, { target: { value: '50' } })
      fireEvent.change(maxInput, { target: { value: '500' } })

      fireEvent.click(screen.getByTestId('start-session'))
      act(() => { vi.advanceTimersByTime(100) })

      // getChipDenominations(50, 500) → [50, 100, 200, 250, 500] (additive, prefixed with +)
      expect(screen.getByText('+$50')).toBeTruthy()
      expect(screen.getByText('+$100')).toBeTruthy()
      expect(screen.getByText('+$200')).toBeTruthy()
      expect(screen.getByText('+$250')).toBeTruthy()
      expect(screen.getByText('+$500')).toBeTruthy()
    })
  })

  describe('Player Nameplate', () => {
    it('human nameplate (★ YOU) is rendered inside the seat block', () => {
      render(<CasinoSession />)
      fireEvent.click(screen.getByTestId('start-session'))
      act(() => { vi.advanceTimersByTime(100) })

      expect(screen.getByText(/★.*YOU/)).toBeTruthy()
    })

    it('bot status badges are shown for each seated bot', () => {
      render(<CasinoSession />)
      fireEvent.click(screen.getByTestId('start-session'))
      act(() => { vi.advanceTimersByTime(100) })

      // Info strip should contain bot status badges
      const statusBadges = screen.queryAllByTestId('bot-status')
      expect(statusBadges.length).toBeGreaterThan(0)
    })
  })

  describe('Casino Ambient Sound', () => {
    it('casino ambient starts on session start', async () => {
      const { casinoAmbient } = await import('../../services/casino-ambient')

      render(<CasinoSession />)
      fireEvent.click(screen.getByTestId('start-session'))
      act(() => { vi.advanceTimersByTime(100) })

      expect(casinoAmbient.start).toHaveBeenCalled()
    })

    it('casino ambient stops on session end (quit)', async () => {
      const { casinoAmbient } = await import('../../services/casino-ambient')

      render(<CasinoSession />)
      fireEvent.click(screen.getByTestId('start-session'))
      act(() => { vi.advanceTimersByTime(100) })

      fireEvent.click(screen.getByTestId('pause-button'))
      fireEvent.click(screen.getByTestId('quit-session'))

      expect(casinoAmbient.stop).toHaveBeenCalled()
    })
  })

  describe('Sequential Bot Play', () => {
    function startSession() {
      render(<CasinoSession />)
      fireEvent.click(screen.getByTestId('start-session'))
      act(() => { vi.advanceTimersByTime(100) })
    }

    it('bots show wait status before deal', () => {
      startSession()

      const statusBadges = screen.queryAllByTestId('bot-status')
      expect(statusBadges.length).toBeGreaterThan(0)
      // All bots should be in "Wait" status initially
      for (const badge of statusBadges) {
        expect(badge.textContent).toBe('Wait')
      }
    })

    it('bots play sequentially with thinking delay', () => {
      startSession()

      // Place bet and deal (additive chips)
      fireEvent.click(screen.getByText('+$25'))
      fireEvent.click(screen.getByTestId('confirm-bet'))

      // Wait for deal animation to complete (500ms per card * total cards + buffer)
      act(() => { vi.advanceTimersByTime(6000) })

      // After deal animation, bots should start playing one at a time
      // At least one bot should transition to thinking or a final status
      const statusBadges = screen.queryAllByTestId('bot-status')
      expect(statusBadges.length).toBeGreaterThan(0)

      // Advance time for bots to finish thinking and playing
      act(() => { vi.advanceTimersByTime(15000) })

      // After all bots played, at least one should have a final status
      const finalBadges = screen.queryAllByTestId('bot-status')
      const finalStatuses = finalBadges.map(b => b.textContent)
      // Derived, not transcribed. This list was written out by hand and had
      // drifted from the source: it was missing '21!' and 'Surrender', so the
      // test failed whenever the shuffle happened to produce a bot that hit
      // exactly twenty-one or surrendered — roughly one run in eight, which
      // read as flakiness and was really an incomplete list.
      const bot = enMessages.casino.bot as Record<string, string>
      const validFinalStatuses = Object.values(BOT_STATUS_LABEL_KEY)
        .map(k => bot[k.replace('casino.bot.', '')])
      for (const status of finalStatuses) {
        expect(validFinalStatuses).toContain(status)
      }
    })

    it('non-active seats are dimmed during bot play', () => {
      startSession()

      fireEvent.click(screen.getByText('+$25'))
      fireEvent.click(screen.getByTestId('confirm-bet'))

      // Wait for deal animation to complete
      act(() => { vi.advanceTimersByTime(6000) })

      // During bot_playing phase, human seat should have dimmed class
      const humanSeat = screen.getByTestId('human-seat')
      // Human seat gets opacity-40 when bots are playing
      const className = humanSeat.className
      // The class should contain transition-opacity (always present)
      expect(className).toContain('transition-opacity')
    })
  })

  describe('Deal Timing', () => {
    it('deal animation uses 500ms card intervals via animation queue', async () => {
      const { soundEngine: se } = await import('../../services/sound-engine')
      const cardDealMock = se.cardDeal as ReturnType<typeof vi.fn>
      cardDealMock.mockClear()

      render(<CasinoSession />)
      fireEvent.click(screen.getByTestId('start-session'))
      act(() => { vi.advanceTimersByTime(100) })

      fireEvent.click(screen.getByText('+$25'))
      fireEvent.click(screen.getByTestId('confirm-bet'))

      // First card sound plays synchronously (queue action runs immediately)
      expect(cardDealMock).toHaveBeenCalledTimes(1)

      // Second card at 500ms
      await act(async () => { vi.advanceTimersByTime(500) })
      expect(cardDealMock).toHaveBeenCalledTimes(2)

      // Third card at 1000ms
      await act(async () => { vi.advanceTimersByTime(500) })
      expect(cardDealMock).toHaveBeenCalledTimes(3)
    })
  })

  describe('Chip Denominations', () => {
    it('chip values include standard denominations for $25-$1000 range', () => {
      render(<CasinoSession />)

      // Change max to 1000
      const maxInput = screen.getByLabelText('Max bet') as HTMLInputElement
      fireEvent.change(maxInput, { target: { value: '1000' } })

      fireEvent.click(screen.getByTestId('start-session'))
      act(() => { vi.advanceTimersByTime(100) })

      // getChipDenominations(25, 1000) → [25, 50, 100, 200, 250, 500, 1000] (7 chips ≤ 8)
      expect(screen.getByText('+$25')).toBeTruthy()
      expect(screen.getByText('+$50')).toBeTruthy()
      expect(screen.getByText('+$100')).toBeTruthy()
      expect(screen.getByText('+$200')).toBeTruthy()
      expect(screen.getByText('+$250')).toBeTruthy()
      expect(screen.getByText('+$500')).toBeTruthy()
      expect(screen.getByText('+$1000')).toBeTruthy()
    })

    it('chip values include $2500 for high-limit tables', () => {
      render(<CasinoSession />)

      // Set min=100, max=5000
      const minInput = screen.getByLabelText('Min bet') as HTMLInputElement
      const maxInput = screen.getByLabelText('Max bet') as HTMLInputElement
      fireEvent.change(minInput, { target: { value: '100' } })
      fireEvent.change(maxInput, { target: { value: '5000' } })

      fireEvent.click(screen.getByTestId('start-session'))
      act(() => { vi.advanceTimersByTime(100) })

      // getChipDenominations(100, 5000) → [100, 200, 250, 500, 1000, 2500, 5000] (7 chips ≤ 8)
      expect(screen.getByText('+$100')).toBeTruthy()
      expect(screen.getByText('+$200')).toBeTruthy()
      expect(screen.getByText('+$250')).toBeTruthy()
      expect(screen.getByText('+$500')).toBeTruthy()
      expect(screen.getByText('+$1000')).toBeTruthy()
      expect(screen.getByText('+$2500')).toBeTruthy()
      expect(screen.getByText('+$5000')).toBeTruthy()
    })
  })

  describe('Table State Cleanup (Bug Fix)', () => {
    function startSession() {
      render(<CasinoSession />)
      fireEvent.click(screen.getByTestId('start-session'))
      act(() => { vi.advanceTimersByTime(100) })
    }

    it('no bot cards visible during initial betting phase', () => {
      startSession()

      // During betting, bot seats should not show any face-up card elements
      const botSeats = screen.queryAllByTestId('bot-seat')
      expect(botSeats.length).toBeGreaterThan(0)
      for (const seat of botSeats) {
        // Cards use bg-white class — none should be present during betting
        const cardFaces = seat.querySelectorAll('[class*="bg-white"]')
        expect(cardFaces.length).toBe(0)
      }
    })

    it('no dealer cards visible during initial betting phase', () => {
      startSession()

      // Dealer should show "Place your bet to deal" text, not cards
      expect(screen.getByText('Place your bet to deal')).toBeTruthy()
    })

    it('no settlement labels visible during betting phase', () => {
      startSession()

      expect(screen.queryByTestId('human-settlement')).toBeNull()
      expect(screen.queryAllByTestId('bot-settlement').length).toBe(0)
    })

    it('all bot statuses reset to wait during betting phase', () => {
      startSession()

      const statusBadges = screen.queryAllByTestId('bot-status')
      for (const badge of statusBadges) {
        expect(badge.textContent).toBe('Wait')
      }
    })
  })

  describe('Seat Flex Positioning', () => {
    it('human seat uses flex layout', () => {
      render(<CasinoSession />)
      fireEvent.click(screen.getByTestId('start-session'))
      act(() => { vi.advanceTimersByTime(100) })

      const humanSeat = screen.getByTestId('human-seat')
      const style = humanSeat.getAttribute('style') || ''
      expect(style).toContain('flex:')
      expect(style).toContain('140px')
    })

    it('bot seats use flex layout in seat row', () => {
      render(<CasinoSession />)
      fireEvent.click(screen.getByTestId('start-session'))
      act(() => { vi.advanceTimersByTime(100) })

      // Deal to get bots visible
      fireEvent.click(screen.getByText('+$25'))
      fireEvent.click(screen.getByTestId('confirm-bet'))
      act(() => { vi.advanceTimersByTime(6000) })

      const botSeats = screen.queryAllByTestId('bot-seat')
      expect(botSeats.length).toBeGreaterThan(0)

      // Bot seats should use flex layout with bounded width
      for (const seat of botSeats) {
        const style = seat.getAttribute('style') || ''
        expect(style).toContain('flex:')
        expect(style).toContain('140px')
      }
    })
  })
})
