import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ResumeSessionCard } from './ResumeSessionCard'
import { useAppStore } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import { useLevelStore } from '../../store/level-store'
import { useLiveSessionStore } from '../../store/live-session-store'
import { useCasinoSessionTrackerStore } from '../../store/casino-session-tracker-store'
import { levelSystem } from '../../services/level-system'
import { LIVE_SESSION_KEY, saveLiveSession } from '../../services/casino-live-session'
import { savedTable } from './saved-table.fixture'
import { trialTableConfig } from './trial-table'
import { useCasinoTrialStore } from '../../store/casino-trial-store'
import { TRIAL_HANDS, setTrialHandsUsed } from '../../services/casino-trial'
import { formatDollar } from './helpers'

/**
 * The one place a saved table is offered.
 *
 * Two choices, both real: sit down again, or take the result of the hands that
 * were played. And for someone whose subscription has ended since, the second
 * one alone — the table is a Pro feature, the hands they played are theirs.
 */

const pro = { is: true }
vi.mock('../../store/entitlement-store', async importOriginal => ({
  ...(await importOriginal<typeof import('../../store/entitlement-store')>()),
  useIsPro: () => pro.is,
}))

const casinoSessions = () => useStatsStore.getState().sessions.filter(s => s.mode === 'casinoSession')

/** A table of three played hands is on the device and the app has seen it. */
function leaveATable(profits = [25, -25, 25]) {
  const saved = savedTable(profits)
  saveLiveSession(saved)
  useLiveSessionStore.getState().refreshSaved()
  return saved
}

beforeEach(() => {
  localStorage.clear()
  pro.is = true
  levelSystem.resetAll()
  useLevelStore.getState().refresh()
  useAppStore.setState({ currentMode: 'home' })
  useStatsStore.setState({ sessions: [], lifetimeStats: null, isLoading: false })
  useCasinoSessionTrackerStore.setState({ sessions: [], startingBankroll: 0 })
  useLiveSessionStore.setState({ activeMode: null, pending: null, saved: null, resumeRequested: false })
  useCasinoTrialStore.getState().refresh()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('with a table saved on the device', () => {
  it('says there is a session in progress, and where it stands', () => {
    leaveATable()
    render(<ResumeSessionCard />)
    const card = screen.getByTestId('resume-session-card')
    expect(card).toHaveTextContent('You have a session in progress')
    expect(screen.getByTestId('resume-session-status')).toHaveTextContent(`Hand 3 · Bankroll ${formatDollar(5025)}`)
    expect(screen.getByTestId('resume-card-continue')).toHaveTextContent('Continue')
    expect(screen.getByTestId('resume-card-cash-out')).toHaveTextContent('Cash out now')
  })

  it('is a card, not a dialog: nothing modal, nothing that has to be answered', () => {
    leaveATable()
    render(<ResumeSessionCard />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('"Continue" sends the player to the table with the request to open the saved one', () => {
    leaveATable()
    render(<ResumeSessionCard />)
    fireEvent.click(screen.getByTestId('resume-card-continue'))

    expect(useLiveSessionStore.getState().resumeRequested).toBe(true)
    expect(useAppStore.getState().currentMode).toBe('casinoSession')
    // Continuing records nothing and keeps the table.
    expect(casinoSessions()).toHaveLength(0)
    expect(localStorage.getItem(LIVE_SESSION_KEY)).not.toBeNull()
  })

  it('"Continue" on the setup screen hands over to the Casino Session itself', () => {
    leaveATable()
    const onContinue = vi.fn()
    render(<ResumeSessionCard onContinue={onContinue} />)
    fireEvent.click(screen.getByTestId('resume-card-continue'))
    expect(onContinue).toHaveBeenCalledOnce()
    expect(useLiveSessionStore.getState().resumeRequested).toBe(false)
  })

  it('"Cash out now" records the session and the card is gone', async () => {
    const saved = leaveATable()
    render(<ResumeSessionCard />)
    fireEvent.click(screen.getByTestId('resume-card-cash-out'))

    await waitFor(() => expect(screen.queryByTestId('resume-session-card')).toBeNull())
    const [row] = casinoSessions()
    expect(row.id).toBe(saved.id)
    expect(row.details).toMatchObject({ handsPlayed: 3, netProfit: 25, finalBankroll: 5025 })
    expect(useCasinoSessionTrackerStore.getState().sessions).toHaveLength(1)
    expect(useLevelStore.getState().totalXP).toBeGreaterThan(0)
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
    // The player stays where they were: no summary, no navigation.
    expect(useAppStore.getState().currentMode).toBe('home')
  })

  it('"Cash out now" pressed twice is one session', async () => {
    leaveATable()
    render(<ResumeSessionCard />)
    const button = screen.getByTestId('resume-card-cash-out')
    fireEvent.click(button)
    fireEvent.click(button)

    await waitFor(() => expect(screen.queryByTestId('resume-session-card')).toBeNull())
    expect(casinoSessions()).toHaveLength(1)
    expect(useCasinoSessionTrackerStore.getState().sessions).toHaveLength(1)
  })

  it('a table nothing was played at is cashed out to nothing: discarded, not recorded', async () => {
    leaveATable([])
    render(<ResumeSessionCard />)
    expect(screen.getByTestId('resume-session-status')).toHaveTextContent(`Hand 0 · Bankroll ${formatDollar(5000)}`)
    fireEvent.click(screen.getByTestId('resume-card-cash-out'))

    await waitFor(() => expect(screen.queryByTestId('resume-session-card')).toBeNull())
    expect(casinoSessions()).toHaveLength(0)
    expect(useLevelStore.getState().totalXP).toBe(0)
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
  })
})

describe('without Pro', () => {
  it('offers the cash-out only — the table itself is a Pro feature', () => {
    leaveATable()
    pro.is = false
    render(<ResumeSessionCard />)
    expect(screen.getByTestId('resume-session-card')).toBeInTheDocument()
    expect(screen.queryByTestId('resume-card-continue')).toBeNull()
    expect(screen.getByTestId('resume-card-cash-out')).toBeEnabled()
    expect(screen.getByTestId('resume-session-card')).toHaveTextContent('part of Pro')
  })

  it('still records the hands that were played', async () => {
    leaveATable()
    pro.is = false
    render(<ResumeSessionCard />)
    fireEvent.click(screen.getByTestId('resume-card-cash-out'))
    await waitFor(() => expect(casinoSessions()).toHaveLength(1))
  })
})

describe('when there is nothing to offer', () => {
  it('renders nothing without a saved table', () => {
    const { container } = render(<ResumeSessionCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing while that table is being played in this tab', () => {
    leaveATable()
    useLiveSessionStore.getState().beginSession('casinoSession')
    const { container } = render(<ResumeSessionCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('goes away when another tab has cashed the table out', () => {
    leaveATable()
    render(<ResumeSessionCard />)
    expect(screen.getByTestId('resume-session-card')).toBeInTheDocument()

    localStorage.removeItem(LIVE_SESSION_KEY)
    fireEvent.click(screen.getByTestId('resume-card-cash-out'))
    return waitFor(() => expect(screen.queryByTestId('resume-session-card')).toBeNull())
      .then(() => expect(casinoSessions()).toHaveLength(0))
  })
})

describe('a saved trial table, for an account without Pro', () => {
  /** The free trial's table, three hands in, is on the device. */
  function leaveATrialTable() {
    const base = savedTable([25, -25, 25])
    const config = { ...trialTableConfig(), numBots: 0, casinoAmbience: false }
    saveLiveSession({ ...base, config, snapshot: { ...base.snapshot, config } })
    useLiveSessionStore.getState().refreshSaved()
  }

  beforeEach(() => { pro.is = false })

  it('can be continued while trial hands remain', () => {
    setTrialHandsUsed(3)
    leaveATrialTable()
    render(<ResumeSessionCard />)

    expect(screen.getByTestId('resume-card-continue')).toBeInTheDocument()
    expect(screen.getByTestId('resume-card-cash-out')).toBeInTheDocument()
    // Not the sentence that says the table is closed to them: it is not.
    expect(screen.getByTestId('resume-session-card')).not.toHaveTextContent('part of Pro')
  })

  it('cannot be continued once the trial is used up — only cashed out', () => {
    setTrialHandsUsed(TRIAL_HANDS)
    leaveATrialTable()
    render(<ResumeSessionCard />)

    expect(screen.queryByTestId('resume-card-continue')).toBeNull()
    expect(screen.getByTestId('resume-card-cash-out')).toBeInTheDocument()
    expect(screen.getByTestId('resume-session-card')).toHaveTextContent('The table is part of Pro.')
  })

  it('cannot be continued while the account\'s count is not known on this device', () => {
    leaveATrialTable()
    render(<ResumeSessionCard />)
    expect(screen.queryByTestId('resume-card-continue')).toBeNull()
  })

  it('a Pro table is not opened by trial hands', () => {
    setTrialHandsUsed(0)
    leaveATable()
    render(<ResumeSessionCard />)
    expect(screen.queryByTestId('resume-card-continue')).toBeNull()
    expect(screen.getByTestId('resume-session-card')).toHaveTextContent('The table is part of Pro.')
  })
})
