import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import i18next from 'i18next'
import { render, screen, cleanup, fireEvent, within, act } from '@testing-library/react'
import { TrainingPlan } from './TrainingPlan'
import { useAppStore } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import { useUpgradePrompt } from '../../store/upgrade-prompt-store'
import { useChallengeStore } from '../../store/challenge-store'
import { stageXP } from '../../services/stage-rewards'
import { getPlacement, getReadStages, hasSkippedPlacement, CURRICULUM, type StageId } from '../../services/curriculum'
import { getProfile, commitmentFor } from '../../services/learner-profile'
import { readPlanState, writePlanState, type PlanState } from '../../services/plan-state'
import { isRecommendationDone } from '../../services/recommendation'
import type { TrainingMode, TrainingSessionResult } from '../../services/stats-types'

// Pro state is the one input the plan cannot derive from sessions, so it is the
// one thing mocked here. Everything else runs the real derivation.
const proState = { isPro: true }
vi.mock('../../store/entitlement-store', async importOriginal => ({
  ...(await importOriginal<typeof import('../../store/entitlement-store')>()),
  useIsPro: () => proState.isPro,
}))

/** A session `daysAgo` before now — the plan reads the real clock. */
function agedSession(daysAgo: number, mode: TrainingMode, accuracy: number): TrainingSessionResult {
  return {
    ...session(mode, accuracy),
    timestamp: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  }
}

const manyAged = (n: number, daysAgo: number, mode: TrainingMode, accuracy: number) =>
  Array.from({ length: n }, () => agedSession(daysAgo, mode, accuracy))

function session(mode: TrainingMode, accuracy: number, details?: unknown): TrainingSessionResult {
  return {
    id: crypto.randomUUID(),
    mode,
    // Recent by default, so tests that are not about time see no gap notice.
    timestamp: new Date().toISOString(),
    durationSeconds: 120,
    totalQuestions: 20,
    correctAnswers: Math.round(20 * accuracy),
    accuracy,
    bestStreak: 5,
    details,
  } as unknown as TrainingSessionResult
}

/** n sessions of the same kind, all clearing the accuracy bar. */
const many = (n: number, mode: TrainingMode, accuracy: number, details?: unknown) =>
  Array.from({ length: n }, () => session(mode, accuracy, details))

const drillOf = (id: StageId) => CURRICULUM.find(s => s.id === id)!.drill!

/**
 * A stage finished by its own rule, read from the curriculum rather than
 * typed in here: its `minSessions` runs on its `minDays` different days, the
 * newest of them `daysAgo` days back. Whole days apart, so each is its own
 * local calendar day.
 */
function finishing(id: StageId, mode: TrainingMode, accuracy: number, daysAgo = 0): TrainingSessionResult[] {
  const drill = drillOf(id)
  const sessions = Array.from({ length: drill.minSessions }, (_, i) =>
    agedSession(daysAgo + (i % drill.minDays), mode, accuracy))
  if (!sessions.every(drill.counts)) throw new Error(`sessions do not count towards ${id}`)
  return sessions
}

/** The stage named in the "up next" card's heading. */
const upNextTitle = () =>
  within(screen.getByTestId('plan-up-next')).getByRole('heading', { level: 2 }).textContent

/** The rows of today's session, as `kind` strings in order. */
const todayRows = () =>
  within(screen.getByTestId('plan-today')).getAllByTestId(/^plan-block-/)
    .map(el => el.getAttribute('data-testid')!.replace('plan-block-', ''))

beforeEach(() => {
  localStorage.clear()
  // Most tests are about the plan, not the greeting; the greeting has its own.
  localStorage.setItem('bjt_welcome_seen', 'true')
  proState.isPro = true
  useAppStore.setState({ currentMode: 'plan' })
  useUpgradePrompt.setState({ open: false, headline: null })
  // The plan only reads `sessions`; stub the loader so no storage call fires.
  useStatsStore.setState({ sessions: [], lifetimeStats: null, loadStats: vi.fn() })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TrainingPlan', () => {
  it('greets a brand-new account before asking it anything', () => {
    localStorage.removeItem('bjt_welcome_seen')
    render(<TrainingPlan />)
    expect(screen.getByTestId('welcome-screen')).toBeInTheDocument()
    expect(screen.queryByTestId('starting-point')).toBeNull()

    fireEvent.click(screen.getByTestId('welcome-start'))
    expect(screen.getByTestId('starting-point')).toBeInTheDocument()
  })

  it('greets a Pro account with its own copy', () => {
    localStorage.removeItem('bjt_welcome_seen')
    render(<TrainingPlan />)
    expect(screen.getByTestId('welcome-eyebrow')).toHaveTextContent('Welcome to Pro')

    cleanup()
    proState.isPro = false
    localStorage.removeItem('bjt_welcome_seen')
    render(<TrainingPlan />)
    expect(screen.getByTestId('welcome-eyebrow')).toHaveTextContent('Welcome')
    expect(screen.getByTestId('welcome-footnote')).toBeInTheDocument()
  })

  it('never greets the same account twice', () => {
    localStorage.setItem('bjt_welcome_seen', 'true')
    render(<TrainingPlan />)
    expect(screen.queryByTestId('welcome-screen')).toBeNull()
    expect(screen.getByTestId('starting-point')).toBeInTheDocument()
  })

  it('does not greet a placed learner who is retaking the test', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    render(<TrainingPlan />)
    fireEvent.click(screen.getByTestId('plan-retake'))
    expect(screen.queryByTestId('welcome-screen')).toBeNull()
    expect(screen.getByTestId('starting-point')).toBeInTheDocument()
  })

  it('sends an unplaced user to the assessment after the greeting', () => {
    localStorage.setItem('bjt_welcome_seen', 'true')
    render(<TrainingPlan />)
    expect(screen.getByTestId('starting-point')).toBeInTheDocument()
    expect(screen.queryByTestId('training-plan')).not.toBeInTheDocument()
  })

  it('goes question → time → plan: two answers, no test and no result screen', () => {
    // Still no card test and no result screen. What was added on 17 Nov 2026
    // is the one question the plan cannot work without: how much time is there.
    render(<TrainingPlan />)

    fireEvent.click(screen.getByTestId('entry-new'))

    // The level is stored at once — leaving now loses nothing.
    expect(getPlacement()).toBe('rules')
    expect(screen.queryByTestId('starting-point')).toBeNull()
    expect(screen.getByTestId('time-question')).toBeInTheDocument()
    expect(screen.queryByTestId('training-plan')).toBeNull()

    fireEvent.click(screen.getByTestId('time-question-done'))

    expect(screen.queryByTestId('time-question')).toBeNull()
    expect(screen.getByTestId('training-plan')).toBeInTheDocument()
  })

  it('places each answer at its own stage', () => {
    // Every rung has to lead somewhere different, or two of the options are
    // secretly the same question.
    const cases = [
      ['entry-new', 'rules'],
      ['entry-rules', 'basic-strategy'],
      ['entry-strategy', 'hi-lo'],
      ['entry-counting', 'true-count'],
      ['entry-truecount', 'deviations'],
      ['entry-deviations', 'bet-spread'],
      ['entry-table', 'table'],
    ] as const

    for (const [testId, stage] of cases) {
      localStorage.removeItem('bjt_placement')
      const { unmount } = render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId(testId))
      expect(getPlacement(), testId).toBe(stage)
      unmount()
    }
  })

  it('writes a usable profile as soon as the level is picked', () => {
    render(<TrainingPlan />)
    fireEvent.click(screen.getByTestId('entry-strategy'))

    // The goal is not asked, but the plan needs one; and the profile has to
    // exist before the time question is answered, in case it never is.
    const profile = getProfile()
    expect(profile).not.toBeNull()
    expect(profile?.goal).toBe('serious')
    expect(profile?.commitment).toBe('casual')
    // Not answered yet, and not invented.
    expect(profile?.daysPerWeek).toBeUndefined()
    expect(profile?.minutesPerDay).toBeUndefined()
  })

  it('shows the whole path with the placed stage up next', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    render(<TrainingPlan />)

    CURRICULUM.forEach(s => {
      expect(screen.getByTestId(`plan-stage-${s.id}`)).toBeInTheDocument()
    })
    expect(upNextTitle()).toBe('The Hi-Lo count')
    // 7 stages total, placed at index 2 → 5 remain.
    expect(screen.getByText('0 of 5 stages complete')).toBeInTheDocument()
  })

  it('marks stages before the placement as skipped rather than incomplete', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    render(<TrainingPlan />)

    const rules = screen.getByTestId('plan-stage-rules')
    expect(within(rules).getByText('skipped by placement')).toBeInTheDocument()
    expect(within(screen.getByTestId('plan-stage-hi-lo')).queryByText('skipped by placement')).toBeNull()
  })

  it('moves up next along as drills are cleared', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    // Hi-Lo's own bar: its sessions above 90%, on its number of different days.
    useStatsStore.setState({ sessions: finishing('hi-lo', 'speedDrill', 0.95) })
    render(<TrainingPlan />)

    expect(upNextTitle()).toBe('True count')
    expect(screen.getByText('1 of 5 stages complete')).toBeInTheDocument()
  })

  it('does not move on from a stage drilled to the full count in one sitting', () => {
    // 17 Nov 2026: three good runs closed a stage, and the plan was over in
    // an afternoon. The sessions are all here; the other days are not.
    localStorage.setItem('bjt_placement', 'hi-lo')
    const { minSessions, minDays } = drillOf('hi-lo')
    useStatsStore.setState({ sessions: many(minSessions, 'speedDrill', 0.95) })
    render(<TrainingPlan />)

    expect(upNextTitle()).toBe('The Hi-Lo count')
    expect(screen.getByText('0 of 5 stages complete')).toBeInTheDocument()
    // And it says what is missing, in days.
    const standing = screen.getByTestId('plan-standing').textContent!
    expect(standing).toMatch(/Enough good sessions/)
    expect(standing).toContain(`${minDays - 1} more days`)
    // The list shows both counts: sessions full, days not.
    expect(screen.getByTestId('plan-stage-hi-lo').textContent)
      .toContain(`${minSessions}/${minSessions} · 1/${minDays} days`)
  })

  it('keeps a stage finished under the old bar finished, once it was paid', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    localStorage.setItem('bjt_claimed_stages', JSON.stringify(['hi-lo']))
    useStatsStore.setState({ sessions: many(3, 'speedDrill', 0.95) })
    render(<TrainingPlan />)

    expect(upNextTitle()).toBe('True count')
    expect(screen.getByText('1 of 5 stages complete')).toBeInTheDocument()
  })

  it('does not count sessions that missed the accuracy bar', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    // Everything the stage asks for except the accuracy.
    useStatsStore.setState({ sessions: finishing('hi-lo', 'speedDrill', 0.6) })
    render(<TrainingPlan />)

    expect(upNextTitle()).toBe('The Hi-Lo count')
    expect(screen.getByText('0 of 5 stages complete')).toBeInTheDocument()
  })

  it('lays out today’s session in the up-next card, in place of one drill button', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    render(<TrainingPlan />)

    const upNext = screen.getByTestId('plan-up-next')
    expect(within(upNext).getByTestId('plan-today')).toBeInTheDocument()
    // The old primary button is gone from this card: the blocks replace it.
    expect(within(upNext).queryByTestId('plan-drill-hi-lo')).toBeNull()
    // Never drilled, with basic strategy behind it: warm up, read, then work.
    expect(todayRows()).toEqual(['warmup', 'read', 'work'])
    expect(screen.getByTestId('plan-today-minutes')).toHaveTextContent('0 of 20 min')
  })

  it('sends each block to its own screen', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    render(<TrainingPlan />)

    fireEvent.click(screen.getByTestId('plan-block-work'))
    expect(useAppStore.getState().currentMode).toBe('speedDrill')

    fireEvent.click(screen.getByTestId('plan-block-read'))
    expect(useAppStore.getState().currentMode).toBe('learn')

    fireEvent.click(screen.getByTestId('plan-block-warmup'))
    expect(useAppStore.getState().currentMode).toBe('deviationTraining')
  })

  it('starts the day at its first open block', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    render(<TrainingPlan />)

    const start = screen.getByTestId('plan-today-start')
    expect(start).toHaveTextContent('Start: Warm-up · Basic strategy')
    fireEvent.click(start)
    expect(useAppStore.getState().currentMode).toBe('deviationTraining')
  })

  it('ticks off what was trained today and moves the start button on', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    // The warm-up and one of the Speed Drills, both today.
    useStatsStore.setState({ sessions: [session('deviationFlashCards', 0.9), session('speedDrill', 0.5)] })
    render(<TrainingPlan />)

    expect(screen.getByTestId('plan-block-warmup')).toHaveAttribute('data-done', 'true')
    // Three runs of the drill are one row; one of them is recorded.
    const work = screen.getByTestId('plan-block-work')
    expect(work).toHaveAttribute('data-runs', '3')
    expect(work).toHaveAttribute('data-done', 'false')
    expect(work).toHaveTextContent('1/3')
    expect(screen.getByTestId('plan-today-minutes')).toHaveTextContent('10 of 20 min')

    const start = screen.getByTestId('plan-today-start')
    expect(start).toHaveTextContent('Next: Today’s work · The Hi-Lo count')
    fireEvent.click(start)
    expect(useAppStore.getState().currentMode).toBe('speedDrill')
  })

  it('says the day is done once every block is covered, and offers no start button', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    useStatsStore.setState({
      sessions: [session('deviationFlashCards', 0.9), ...many(3, 'speedDrill', 0.5)],
    })
    render(<TrainingPlan />)

    expect(screen.getByTestId('plan-today-complete')).toBeInTheDocument()
    expect(screen.queryByTestId('plan-today-start')).toBeNull()
    expect(screen.getByTestId('plan-today-minutes')).toHaveTextContent('20 of 20 min')
    // Done for today is not done for the stage.
    expect(upNextTitle()).toBe('The Hi-Lo count')
  })

  it('shows the week in training days against the days planned', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    localStorage.setItem('bjt_learner_profile', JSON.stringify({
      goal: 'serious', commitment: 'casual', daysPerWeek: 4, minutesPerDay: 20,
    }))
    useStatsStore.setState({ sessions: many(3, 'speedDrill', 0.5) })
    render(<TrainingPlan />)

    // Three sessions today are one training day.
    expect(within(screen.getByTestId('plan-today')).getByText('1 of 4 days')).toBeInTheDocument()
    const dots = screen.getByTestId('plan-week').querySelectorAll('[data-trained]')
    expect(dots).toHaveLength(7)
    expect(screen.getByTestId('plan-week').querySelectorAll('[data-trained="true"]')).toHaveLength(1)
  })

  it('seats a Pro learner at the table once counting is in place and the day is long enough', () => {
    localStorage.setItem('bjt_placement', 'true-count')
    localStorage.setItem('bjt_learner_profile', JSON.stringify({
      goal: 'serious', commitment: 'regular', daysPerWeek: 5, minutesPerDay: 30,
    }))
    render(<TrainingPlan />)

    expect(todayRows()).toContain('table')
    fireEvent.click(screen.getByTestId('plan-block-table'))
    expect(useAppStore.getState().currentMode).toBe('casinoSession')

    cleanup()
    proState.isPro = false
    render(<TrainingPlan />)
    expect(todayRows()).not.toContain('table')
  })

  it('ticks a reading stage off when the user confirms it', () => {
    localStorage.setItem('bjt_placement', 'rules')
    render(<TrainingPlan />)

    expect(upNextTitle()).toBe('The game itself')
    // A reading stage is the one thing the blocks cannot tick, so the card
    // keeps its own button for it.
    fireEvent.click(within(screen.getByTestId('plan-up-next')).getByTestId('plan-mark-read-rules'))

    expect(getReadStages()).toEqual(['rules'])
    // The screen moves on without a reload.
    expect(upNextTitle()).toBe('Basic strategy')
  })

  it('offers the paywall instead of a drill on a Pro stage', () => {
    proState.isPro = false
    localStorage.setItem('bjt_placement', 'bet-spread')
    render(<TrainingPlan />)

    expect(screen.queryByTestId('plan-drill-bet-spread')).not.toBeInTheDocument()
    // Nothing in today's session opens the locked drill either.
    expect(todayRows()).not.toContain('work')
    expect(screen.getByTestId('plan-locked-focus')).toHaveTextContent('Bet spread is part of Pro')
    fireEvent.click(within(screen.getByTestId('plan-up-next')).getByTestId('plan-unlock-bet-spread'))

    const prompt = useUpgradePrompt.getState()
    expect(prompt.open).toBe(true)
    expect(prompt.headline).toContain('Bet spread')
  })

  it('drills a Pro stage directly once the user is Pro', () => {
    localStorage.setItem('bjt_placement', 'bet-spread')
    render(<TrainingPlan />)

    expect(screen.queryByTestId('plan-unlock-bet-spread')).not.toBeInTheDocument()
    expect(screen.queryByTestId('plan-locked-focus')).toBeNull()
    // Through today's work, which is where the drill button went.
    fireEvent.click(screen.getByTestId('plan-block-work'))
    expect(useAppStore.getState().currentMode).toBe('betSpread')
  })

  it('celebrates a finished path instead of leaving up next empty', () => {
    localStorage.setItem('bjt_placement', 'bet-spread')
    useStatsStore.setState({
      sessions: [...finishing('bet-spread', 'betSpread', 0.9), ...finishing('table', 'casinoSession', 1)],
    })
    render(<TrainingPlan />)

    expect(screen.getByTestId('plan-complete')).toBeInTheDocument()
    expect(screen.queryByTestId('plan-up-next')).not.toBeInTheDocument()
    expect(screen.getByText('2 of 2 stages complete')).toBeInTheDocument()
    // Somewhere to go, not just a compliment: today still has a session.
    const today = within(screen.getByTestId('plan-complete')).getByTestId('plan-today')
    expect(within(today).getAllByTestId(/^plan-block-/).length).toBeGreaterThan(0)
    expect(screen.queryByTestId('plan-forecast')).toBeNull()
  })

  it('does not celebrate a path whose last stage is still waiting on days', () => {
    localStorage.setItem('bjt_placement', 'bet-spread')
    const table = drillOf('table')
    useStatsStore.setState({
      sessions: [...finishing('bet-spread', 'betSpread', 0.9), ...many(table.minSessions, 'casinoSession', 1)],
    })
    render(<TrainingPlan />)

    expect(screen.queryByTestId('plan-complete')).toBeNull()
    expect(upNextTitle()).toBe('The whole thing, at the table')
    expect(screen.getByText('1 of 2 stages complete')).toBeInTheDocument()
  })

  it('shows what finishing the current stage is worth', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    render(<TrainingPlan />)

    const upNext = screen.getByTestId('plan-up-next')
    expect(within(upNext).getByText(`${stageXP('hi-lo')} XP`)).toBeInTheDocument()
  })

  it('surfaces today’s challenge as part of the plan', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    useChallengeStore.setState({
      challenge: {
        id: 'test', titleKey: 'chal.warm_up.title', descKey: 'chal.warm_up.desc', icon: '🎯',
        type: 'play_sessions', difficulty: 'medium', target: 2,
        progressMode: 'cumulative_today', requiredMode: 'speedDrill',
      },
      state: { challengeId: 'test', date: '2026-07-22', progress: 1, completed: false, completedAt: null },
    })
    render(<TrainingPlan />)

    const card = screen.getByTestId('plan-daily-challenge')
    expect(within(card).getByText(i18next.t('chal.warm_up.title'))).toBeInTheDocument()
    expect(within(card).getByText('+100 XP')).toBeInTheDocument()
  })

  it('sends the challenge card to the screen the challenge needs', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    useChallengeStore.setState({
      challenge: {
        id: 'test', titleKey: 'chal.at_the_table.title', descKey: 'chal.at_the_table.desc', icon: '🎯',
        type: 'play_sessions', difficulty: 'easy', target: 1,
        progressMode: 'cumulative_today', requiredMode: 'deviationFlashCards',
      },
      state: { challengeId: 'test', date: '2026-07-22', progress: 0, completed: false, completedAt: null },
    })
    render(<TrainingPlan />)

    fireEvent.click(screen.getByTestId('plan-daily-challenge'))
    expect(useAppStore.getState().currentMode).toBe('deviationTraining')
  })

  it('hides the challenge card once the whole path is done', () => {
    localStorage.setItem('bjt_placement', 'bet-spread')
    useStatsStore.setState({
      sessions: [...finishing('bet-spread', 'betSpread', 0.9), ...finishing('table', 'casinoSession', 1)],
    })
    render(<TrainingPlan />)

    expect(screen.queryByTestId('plan-daily-challenge')).toBeNull()
  })

  it('shows recent form on the current stage, against its accuracy floor', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    useStatsStore.setState({ sessions: [session('speedDrill', 0.7), session('speedDrill', 0.95)] })
    render(<TrainingPlan />)

    const form = screen.getByTestId('plan-stage-form')
    expect(within(form).getByText('Last 2')).toBeInTheDocument()
    // Latest attempt against the Hi-Lo stage's 90% bar.
    expect(within(form).getByText(/95%/)).toBeInTheDocument()
    expect(within(form).getByText(/90%/)).toBeInTheDocument()
  })

  it('hides recent form until there is something to show', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    render(<TrainingPlan />)
    expect(screen.queryByTestId('plan-stage-form')).toBeNull()
  })

  it('hides recent form on a stage with nothing measurable to drill', () => {
    localStorage.setItem('bjt_placement', 'rules')
    useStatsStore.setState({ sessions: [session('speedDrill', 0.95)] })
    render(<TrainingPlan />)
    expect(screen.queryByTestId('plan-stage-form')).toBeNull()
  })

  it('sends recent form through to Analytics for the full picture', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    useStatsStore.setState({ sessions: [session('speedDrill', 0.7), session('speedDrill', 0.95)] })
    render(<TrainingPlan />)

    fireEvent.click(screen.getByTestId('plan-stage-form'))
    expect(useAppStore.getState().currentMode).toBe('analytics')
  })

  it('offers a free learner the open stage behind a locked one', () => {
    proState.isPro = false
    localStorage.setItem('bjt_placement', 'true-count')
    render(<TrainingPlan />)

    // Up next is the Pro stage, honestly locked...
    expect(upNextTitle()).toBe('True count')
    expect(screen.getByTestId('plan-unlock-true-count')).toBeInTheDocument()
    expect(screen.getByTestId('plan-locked-focus')).toHaveTextContent('True count is part of Pro')

    // ...and today's session is built from the stage that is open: nothing in
    // it leads to the locked drill.
    expect(todayRows()).toContain('work')
    fireEvent.click(screen.getByTestId('plan-block-work'))
    expect(useAppStore.getState().currentMode).toBe('deviationTraining')
    useAppStore.setState({ currentMode: 'plan' })

    // ...but the plan does not dead-end there.
    const instead = screen.getByTestId('plan-open-instead')
    expect(within(instead).getByText('Deviations')).toBeInTheDocument()
    fireEvent.click(within(instead).getByTestId('plan-drill-deviations'))
    expect(useAppStore.getState().currentMode).toBe('deviationTraining')
  })

  it('says nothing about alternatives when the current stage is open', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    render(<TrainingPlan />)
    expect(screen.queryByTestId('plan-open-instead')).toBeNull()
  })

  it('says nothing when everything ahead is locked too', () => {
    proState.isPro = false
    localStorage.setItem('bjt_placement', 'bet-spread')
    render(<TrainingPlan />)
    expect(screen.queryByTestId('plan-open-instead')).toBeNull()
  })

  it('never offers an alternative the same screen calls beyond your goal', () => {
    // The plan used to say "open to you now: Deviations" a few rows above a
    // list entry labelling Deviations "beyond your goal".
    proState.isPro = false
    localStorage.setItem('bjt_placement', 'true-count')
    localStorage.setItem('bjt_learner_profile', JSON.stringify({ goal: 'curious', commitment: 'casual' }))
    render(<TrainingPlan />)

    expect(screen.getByTestId('plan-unlock-true-count')).toBeInTheDocument()
    expect(screen.queryByTestId('plan-open-instead')).toBeNull()
  })

  it('counts a single remaining stage in the singular', () => {
    localStorage.setItem('bjt_placement', 'true-count')
    localStorage.setItem('bjt_learner_profile', JSON.stringify({ goal: 'curious', commitment: 'casual' }))
    render(<TrainingPlan />)
    expect(screen.getByText('0 of 1 stage complete')).toBeInTheDocument()
  })

  describe('adjusting the plan', () => {
    beforeEach(() => {
      localStorage.setItem('bjt_placement', 'hi-lo')
      localStorage.setItem('bjt_learner_profile', JSON.stringify({ goal: 'serious', commitment: 'casual' }))
    })

    it('stays closed until asked for', () => {
      render(<TrainingPlan />)
      expect(screen.queryByTestId('plan-settings')).toBeNull()
    })

    it('opens from either header card', () => {
      const { unmount } = render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('plan-goal'))
      expect(screen.getByTestId('plan-settings')).toBeInTheDocument()
      unmount()

      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('plan-pace'))
      expect(screen.getByTestId('plan-settings')).toBeInTheDocument()
    })

    it('changes the goal without touching the placement', () => {
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('plan-goal'))
      fireEvent.click(screen.getByTestId('plan-set-goal-curious'))

      expect(getProfile()?.goal).toBe('curious')
      expect(getPlacement()).toBe('hi-lo') // untouched
      // The path now ends earlier, so the count shrinks with it.
      expect(within(screen.getByTestId('plan-goal')).getByText('True count')).toBeInTheDocument()
    })

    it('shows the time as days and minutes, filled in from the old pace', () => {
      render(<TrainingPlan />)
      // A profile from before the question: "casual" reads as 3 days of 20 min.
      expect(screen.getByTestId('plan-pace')).toHaveTextContent('3 days a week · 20 min')
    })

    it('offers days and minutes as plain buttons, and no named paces', () => {
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('plan-pace'))

      const settings = screen.getByTestId('plan-settings')
      for (const d of [1, 2, 3, 4, 5, 6, 7]) {
        expect(within(settings).getByTestId(`budget-days-${d}`)).toBeInTheDocument()
      }
      for (const m of [10, 20, 30, 60]) {
        expect(within(settings).getByTestId(`budget-minutes-${m}`)).toBeInTheDocument()
      }
      expect(settings.querySelector('[data-testid^="plan-set-pace-"]')).toBeNull()
      // The current answer is the pressed one, and the only one.
      expect(screen.getByTestId('budget-days-3')).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByTestId('budget-minutes-20')).toHaveAttribute('aria-pressed', 'true')
      expect(settings.querySelectorAll('[aria-pressed="true"]')).toHaveLength(2)
    })

    it('changes the time budget, and the day and the stored pace move with it', () => {
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('plan-pace'))
      expect(screen.getByTestId('plan-today-minutes')).toHaveTextContent('0 of 20 min')

      fireEvent.click(screen.getByTestId('budget-days-7'))
      expect(getProfile()).toMatchObject({ daysPerWeek: 7, minutesPerDay: 20 })
      expect(screen.getByTestId('plan-pace')).toHaveTextContent('7 days a week · 20 min')

      fireEvent.click(screen.getByTestId('budget-minutes-60'))
      expect(getProfile()).toEqual({
        goal: 'serious',
        daysPerWeek: 7,
        minutesPerDay: 60,
        // The old pace follows the budget — challenges still read it.
        commitment: commitmentFor({ daysPerWeek: 7, minutesPerDay: 60 }),
      })
      expect(getProfile()?.commitment).toBe('heavy')
      expect(screen.getByTestId('plan-pace')).toHaveTextContent('7 days a week · 60 min')
      expect(screen.getByTestId('budget-days-7')).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByTestId('budget-minutes-60')).toHaveAttribute('aria-pressed', 'true')
      // Today's session is cut to the new length straight away.
      expect(screen.getByTestId('plan-today-minutes')).toHaveTextContent('0 of 60 min')
      // And none of it touched where the plan starts.
      expect(getPlacement()).toBe('hi-lo')
    })

    it('says one day in the singular', () => {
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('plan-pace'))
      fireEvent.click(screen.getByTestId('budget-days-1'))
      expect(screen.getByTestId('plan-pace')).toHaveTextContent('1 day a week · 20 min')
    })

    it('forecasts the weeks left, and more days a week make it fewer', () => {
      render(<TrainingPlan />)
      const weeksShown = () => Number(screen.getByTestId('plan-forecast').textContent!.match(/\d+/)![0])
      fireEvent.click(screen.getByTestId('plan-pace'))
      fireEvent.click(screen.getByTestId('budget-days-1'))
      const slow = weeksShown()
      fireEvent.click(screen.getByTestId('budget-days-7'))
      const fast = weeksShown()
      expect(slow).toBeGreaterThan(fast)
      expect(fast).toBeGreaterThan(0)
    })

    it('keeps completed work when the goal changes', () => {
      useStatsStore.setState({ sessions: finishing('hi-lo', 'speedDrill', 0.95) })
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('plan-goal'))
      fireEvent.click(screen.getByTestId('plan-set-goal-profit'))

      expect(getReadStages()).toEqual([])
      expect(within(screen.getByTestId('plan-stage-hi-lo')).getByText('The Hi-Lo count')).toBeInTheDocument()
      expect(screen.getByText(/1 of \d+ stages complete/)).toBeInTheDocument()
    })

    it('warns which goals a free account cannot finish', () => {
      proState.isPro = false
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('plan-goal'))
      expect(screen.getByTestId('plan-settings').textContent).toMatch(/need(s)? Pro/)
    })

    it('closes again', () => {
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('plan-goal'))
      fireEvent.click(screen.getByTestId('plan-settings-close'))
      expect(screen.queryByTestId('plan-settings')).toBeNull()
    })
  })

  it('offers the next goal up once the current one is reached', () => {
    localStorage.setItem('bjt_placement', 'true-count')
    localStorage.setItem('bjt_learner_profile', JSON.stringify({ goal: 'curious', commitment: 'casual' }))
    useStatsStore.setState({ sessions: finishing('true-count', 'deckEstimation', 0.9) })
    render(<TrainingPlan />)

    expect(screen.getByTestId('plan-complete')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('plan-extend-goal'))

    // The plan reopens with more to do rather than congratulating and stopping.
    expect(getProfile()?.goal).toBe('stop-losing')
    expect(screen.getByTestId('plan-up-next')).toBeInTheDocument()
  })

  it('offers nothing further at the top of the ladder', () => {
    localStorage.setItem('bjt_placement', 'bet-spread')
    localStorage.setItem('bjt_learner_profile', JSON.stringify({ goal: 'serious', commitment: 'casual' }))
    useStatsStore.setState({
      sessions: [...finishing('bet-spread', 'betSpread', 0.9), ...finishing('table', 'casinoSession', 1)],
    })
    render(<TrainingPlan />)

    expect(screen.getByTestId('plan-complete')).toBeInTheDocument()
    expect(screen.queryByTestId('plan-extend-goal')).toBeNull()
  })

  describe('showing effort that has not cleared the bar', () => {
    beforeEach(() => {
      localStorage.setItem('bjt_placement', 'hi-lo') // bar is 90%
    })

    it('tells a near miss apart from guessing', () => {
      // The whole point: both used to render an identical "0/3".
      useStatsStore.setState({ sessions: many(10, 'speedDrill', 0.895) })
      const { unmount } = render(<TrainingPlan />)
      const near = screen.getByTestId('plan-standing').textContent!
      expect(near).toContain('best 89%')
      expect(near).toMatch(/nearly there/i)
      unmount()

      useStatsStore.setState({ sessions: many(10, 'speedDrill', 0.5) })
      render(<TrainingPlan />)
      const poor = screen.getByTestId('plan-standing').textContent!
      expect(poor).toContain('best 50%')
      expect(poor).not.toMatch(/nearly there/i)
      expect(poor).not.toBe(near)
    })

    it('still reports the bar honestly — a near miss is not a pass', () => {
      useStatsStore.setState({ sessions: many(10, 'speedDrill', 0.895) })
      render(<TrainingPlan />)

      expect(screen.getByText('0 of 5 stages complete')).toBeInTheDocument()
      expect(upNextTitle()).toBe('The Hi-Lo count')
    })

    it('never prints a best that looks like it met the bar', () => {
      useStatsStore.setState({ sessions: many(3, 'speedDrill', 0.8999) })
      render(<TrainingPlan />)
      const text = screen.getByTestId('plan-standing').textContent!
      expect(text).toContain('89%')
      expect(text).not.toMatch(/best 90%/)
    })

    it('counts sessions toward the bar once they clear it', () => {
      useStatsStore.setState({
        sessions: [...many(1, 'speedDrill', 0.95), ...many(4, 'speedDrill', 0.4)],
      })
      render(<TrainingPlan />)
      const { minSessions } = drillOf('hi-lo')
      expect(screen.getByTestId('plan-standing').textContent)
        .toContain(`1 of ${minSessions} sessions cleared the bar. ${minSessions - 1} to go.`)
    })

    it('says nothing at all before the first attempt', () => {
      render(<TrainingPlan />)
      expect(screen.queryByTestId('plan-standing')).toBeNull()
    })

    it('reports effort in the full path too, not just up next', () => {
      useStatsStore.setState({ sessions: many(4, 'speedDrill', 0.88) })
      render(<TrainingPlan />)

      const row = screen.getByTestId('plan-stage-hi-lo')
      expect(within(row).getByTestId('stage-effort').textContent)
        .toMatch(/4 attempts so far · best 88%/)
    })

    it('leaves untouched stages in the list silent', () => {
      useStatsStore.setState({ sessions: many(4, 'speedDrill', 0.88) })
      render(<TrainingPlan />)
      expect(within(screen.getByTestId('plan-stage-bet-spread')).queryByTestId('stage-effort')).toBeNull()
    })
  })

  describe('never a gate — the test can be declined', () => {
    beforeEach(() => {
      localStorage.setItem('bjt_welcome_seen', 'true')
    })

    it('offers a way past the test on the first question', () => {
      render(<TrainingPlan />)
      expect(screen.getByTestId('starting-point-skip')).toBeInTheDocument()
    })

    it('leaves the question entirely once it is answered', () => {
      // There is only one question now, so "stop offering the exit after the
      // first answer" has become "the whole screen is done after the first
      // answer" — exit included.
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('entry-strategy'))
      expect(screen.queryByTestId('starting-point-skip')).toBeNull()
      expect(screen.queryByTestId('starting-point')).toBeNull()
    })

    it('shows the real plan to someone who skipped, not an empty shell', () => {
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('starting-point-skip'))

      expect(screen.getByTestId('training-plan')).toBeInTheDocument()
      // The whole path, from the beginning — the curriculum is a fact about
      // card counting, not a personalisation.
      CURRICULUM.forEach(s => expect(screen.getByTestId(`plan-stage-${s.id}`)).toBeInTheDocument())
      expect(upNextTitle()).toBe('The game itself')
      expect(screen.getByText(`0 of ${CURRICULUM.length} stages complete`)).toBeInTheDocument()
    })

    it('claims nothing was skipped when no test was taken', () => {
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('starting-point-skip'))
      expect(screen.queryByText('skipped by placement')).toBeNull()
    })

    it('remembers the decision instead of asking again', () => {
      const { unmount } = render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('starting-point-skip'))
      expect(hasSkippedPlacement()).toBe(true)
      unmount()

      render(<TrainingPlan />)
      expect(screen.getByTestId('training-plan')).toBeInTheDocument()
      expect(screen.queryByTestId('starting-point')).toBeNull()
    })

    it('keeps the test one click away, and taking it works', () => {
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('starting-point-skip'))

      fireEvent.click(screen.getByTestId('plan-take-test'))
      expect(screen.getByTestId('starting-point')).toBeInTheDocument()
      // Looking at the question again undoes nothing yet: leaving it half-way
      // must not put anyone back in front of it on the next visit.
      expect(hasSkippedPlacement()).toBe(true)

      fireEvent.click(screen.getByTestId('entry-strategy'))
      // Answering is what replaces the decline.
      expect(getPlacement()).toBe('hi-lo')
      expect(hasSkippedPlacement()).toBe(false)
      fireEvent.click(screen.getByTestId('time-question-done'))
      expect(upNextTitle()).toBe('The Hi-Lo count')
      expect(screen.queryByTestId('plan-take-test')).toBeNull()
    })

    it('lets them back out of the question again, with nothing changed', () => {
      const { unmount } = render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('starting-point-skip'))
      fireEvent.click(screen.getByTestId('plan-take-test'))
      fireEvent.click(screen.getByTestId('starting-point-skip'))

      expect(screen.getByTestId('training-plan')).toBeInTheDocument()
      expect(getPlacement()).toBeNull()
      expect(hasSkippedPlacement()).toBe(true)
      unmount()

      render(<TrainingPlan />)
      expect(screen.queryByTestId('starting-point')).toBeNull()
      expect(screen.getByTestId('training-plan')).toBeInTheDocument()
    })

    it('lets an unplaced learner start a drill straight away', () => {
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('starting-point-skip'))
      fireEvent.click(screen.getByTestId('plan-drill-hi-lo'))
      expect(useAppStore.getState().currentMode).toBe('speedDrill')
    })

    it('does not offer the test to someone who already took it', () => {
      localStorage.setItem('bjt_placement', 'hi-lo')
      render(<TrainingPlan />)
      expect(screen.queryByTestId('plan-take-test')).toBeNull()
    })
  })

  describe('noticing that time has passed', () => {
    beforeEach(() => {
      localStorage.setItem('bjt_placement', 'hi-lo')
    })

    it('says nothing to someone who trained today', () => {
      useStatsStore.setState({ sessions: manyAged(2, 0, 'speedDrill', 0.95) })
      render(<TrainingPlan />)
      expect(screen.queryByTestId('plan-rhythm')).toBeNull()
    })

    it('says nothing to a learner who has never trained', () => {
      // "Welcome back" to someone who was never here is the failure mode.
      render(<TrainingPlan />)
      expect(screen.queryByTestId('plan-rhythm')).toBeNull()
    })

    it('welcomes a returning learner back without scolding', () => {
      useStatsStore.setState({ sessions: manyAged(2, 6, 'speedDrill', 0.95) })
      render(<TrainingPlan />)

      const strip = screen.getByTestId('plan-rhythm')
      expect(strip.textContent).toMatch(/6 days/)
      expect(strip.textContent).not.toMatch(/haven.t|should have|failed/i)
      // Short gap: nothing has faded, so no warm-up is pushed.
      expect(screen.queryByTestId('plan-warm-up')).toBeNull()
    })

    it('offers a warm-up after a long gap, on the last stage they cleared', () => {
      useStatsStore.setState({ sessions: finishing('hi-lo', 'speedDrill', 0.95, 30) })
      render(<TrainingPlan />)

      expect(screen.getByTestId('plan-rhythm').textContent).toMatch(/30 days/)
      fireEvent.click(screen.getByTestId('plan-warm-up'))
      expect(useAppStore.getState().currentMode).toBe('speedDrill')
    })

    it('offers no warm-up when nothing has been cleared to warm up on', () => {
      useStatsStore.setState({ sessions: manyAged(3, 30, 'speedDrill', 0.4) })
      render(<TrainingPlan />)

      expect(screen.getByTestId('plan-rhythm')).toBeInTheDocument()
      expect(screen.queryByTestId('plan-warm-up')).toBeNull()
    })

    it('never offers a warm-up the learner cannot open', () => {
      proState.isPro = false
      // Deck estimation clears true-count, but that drill is Pro-gated.
      useStatsStore.setState({ sessions: finishing('true-count', 'deckEstimation', 0.9, 30) })
      render(<TrainingPlan />)
      // The stage really is cleared and the gap really is named — so the
      // missing button is the lock, not an empty history.
      expect(screen.getByTestId('plan-rhythm').textContent).toMatch(/30 days/)
      expect(within(screen.getByTestId('plan-stage-true-count')).getByText('PRO')).toBeInTheDocument()
      expect(screen.queryByTestId('plan-warm-up')).toBeNull()
    })

    it('leaves the plan itself untouched — the notice is context, not a detour', () => {
      useStatsStore.setState({ sessions: finishing('hi-lo', 'speedDrill', 0.95, 30) })
      render(<TrainingPlan />)

      expect(upNextTitle()).toBe('True count')
      expect(screen.getByText('1 of 5 stages complete')).toBeInTheDocument()
    })
  })

  describe('the time question', () => {
    it('is asked once, right after the level, and its answer goes into the profile', () => {
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('entry-strategy'))

      const question = screen.getByTestId('time-question')
      // It opens on a middling budget rather than on nothing.
      expect(within(question).getByTestId('budget-days-3')).toHaveAttribute('aria-pressed', 'true')
      expect(within(question).getByTestId('budget-minutes-20')).toHaveAttribute('aria-pressed', 'true')

      fireEvent.click(screen.getByTestId('budget-days-5'))
      fireEvent.click(screen.getByTestId('budget-minutes-30'))
      // Choosing is not answering: nothing is stored until it is confirmed.
      expect(getProfile()?.daysPerWeek).toBeUndefined()
      fireEvent.click(screen.getByTestId('time-question-done'))

      expect(getProfile()).toEqual({
        goal: 'serious',
        daysPerWeek: 5,
        minutesPerDay: 30,
        commitment: commitmentFor({ daysPerWeek: 5, minutesPerDay: 30 }),
      })
      expect(getPlacement()).toBe('hi-lo')
      // The plan opens, already cut to that answer.
      expect(screen.getByTestId('training-plan')).toBeInTheDocument()
      expect(screen.getByTestId('plan-pace')).toHaveTextContent('5 days a week · 30 min')
      expect(screen.getByTestId('plan-today-minutes')).toHaveTextContent('0 of 30 min')
    })

    it('stores an answer even when the suggested budget is simply confirmed', () => {
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('entry-new'))
      fireEvent.click(screen.getByTestId('time-question-done'))

      // Stored, so the account is never asked again — on this device or,
      // once it has travelled, on any other.
      expect(getProfile()).toMatchObject({ goal: 'serious', daysPerWeek: 3, minutesPerDay: 20 })
    })

    it('shows what the choice costs, live', () => {
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('entry-strategy'))

      const weeksShown = () => Number(screen.getByTestId('time-question-forecast').textContent!.match(/\d+/)![0])
      fireEvent.click(screen.getByTestId('budget-days-1'))
      const slow = weeksShown()
      fireEvent.click(screen.getByTestId('budget-days-7'))
      expect(weeksShown()).toBeLessThan(slow)
    })

    it('is not asked again on the next visit', () => {
      const { unmount } = render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('entry-strategy'))
      fireEvent.click(screen.getByTestId('time-question-done'))
      unmount()

      render(<TrainingPlan />)
      expect(screen.queryByTestId('time-question')).toBeNull()
      expect(screen.getByTestId('training-plan')).toBeInTheDocument()
    })

    it('keeps the slots of the page out of sight while it is asked', () => {
      // The home screen hands its header and its sections in as slots; they
      // belong to the plan, not to a question that takes the whole page.
      render(
        <TrainingPlan
          embedded
          before={<div data-testid="slot-before" />}
          after={<div data-testid="slot-after" />}
        />,
      )
      expect(screen.queryByTestId('slot-before')).toBeNull()
      fireEvent.click(screen.getByTestId('entry-strategy'))
      expect(screen.getByTestId('time-question')).toBeInTheDocument()
      expect(screen.queryByTestId('slot-before')).toBeNull()
      expect(screen.queryByTestId('slot-after')).toBeNull()

      fireEvent.click(screen.getByTestId('time-question-done'))
      expect(screen.getByTestId('slot-before')).toBeInTheDocument()
      expect(screen.getByTestId('slot-after')).toBeInTheDocument()
    })
  })

  describe('choosing a different starting point later', () => {
    const answered = { goal: 'profit', commitment: 'regular', daysPerWeek: 4, minutesPerDay: 30 }

    it('keeps the goal and the time, and does not ask for the time again', () => {
      localStorage.setItem('bjt_placement', 'hi-lo')
      localStorage.setItem('bjt_learner_profile', JSON.stringify(answered))
      render(<TrainingPlan />)

      fireEvent.click(screen.getByTestId('plan-retake'))
      fireEvent.click(screen.getByTestId('entry-truecount'))

      // Straight back to the plan: no second question for someone who has
      // already answered it.
      expect(screen.queryByTestId('time-question')).toBeNull()
      expect(screen.getByTestId('training-plan')).toBeInTheDocument()
      expect(getPlacement()).toBe('deviations')
      expect(getProfile()).toEqual(answered)
      expect(within(screen.getByTestId('plan-goal')).getByText('Bet spread')).toBeInTheDocument()
      expect(screen.getByTestId('plan-pace')).toHaveTextContent('4 days a week · 30 min')
    })

    it('keeps the goal of a profile from before the time question, and asks the time once', () => {
      localStorage.setItem('bjt_placement', 'hi-lo')
      localStorage.setItem('bjt_learner_profile', JSON.stringify({ goal: 'profit', commitment: 'regular' }))
      render(<TrainingPlan />)

      fireEvent.click(screen.getByTestId('plan-retake'))
      fireEvent.click(screen.getByTestId('entry-truecount'))

      expect(getProfile()?.goal).toBe('profit')
      // The question opens on what the old pace meant, not on a blank.
      const question = screen.getByTestId('time-question')
      expect(within(question).getByTestId('budget-days-5')).toHaveAttribute('aria-pressed', 'true')
      expect(within(question).getByTestId('budget-minutes-30')).toHaveAttribute('aria-pressed', 'true')
      fireEvent.click(screen.getByTestId('time-question-done'))
      expect(getProfile()).toMatchObject({ goal: 'profit', daysPerWeek: 5, minutesPerDay: 30 })

      // And a second change of mind is not a second time question.
      fireEvent.click(screen.getByTestId('plan-retake'))
      fireEvent.click(screen.getByTestId('entry-new'))
      expect(screen.queryByTestId('time-question')).toBeNull()
      expect(getPlacement()).toBe('rules')
    })

    it('un-places nobody who leaves the question half-way', () => {
      localStorage.setItem('bjt_placement', 'hi-lo')
      localStorage.setItem('bjt_learner_profile', JSON.stringify(answered))
      render(<TrainingPlan />)

      fireEvent.click(screen.getByTestId('plan-retake'))
      expect(screen.getByTestId('starting-point')).toBeInTheDocument()
      // The stored answer is untouched while the question is open...
      expect(getPlacement()).toBe('hi-lo')

      // ...and backing out returns to the same plan, with no decline recorded.
      fireEvent.click(screen.getByTestId('starting-point-skip'))
      expect(upNextTitle()).toBe('The Hi-Lo count')
      expect(getPlacement()).toBe('hi-lo')
      expect(hasSkippedPlacement()).toBe(false)
      expect(getProfile()).toEqual(answered)
    })
  })

  describe('answers that arrive after the screen has mounted', () => {
    // 17 Nov 2026: signing out wipes this device; the account's answers come
    // back with the merge, which lands after the plan has rendered. The plan
    // read them once on mount and asked a returning learner "where are you
    // starting from?" over their real progress.
    const fromAccount: PlanState = {
      placement: 'true-count',
      skipped: false,
      readStages: ['rules'],
      profile: { goal: 'profit', commitment: 'regular', daysPerWeek: 4, minutesPerDay: 30 },
      startLevel: 'counting',
      welcomeSeen: true,
      tourSeen: true,
      recommendationDone: true,
      levelIntroSeen: true,
      updatedAt: 1_700_000_000_000,
    }

    it('shows the plan, not the welcome or the starting question, once they land', () => {
      localStorage.clear() // a device that holds nothing at all
      render(<TrainingPlan />)
      expect(screen.getByTestId('welcome-screen')).toBeInTheDocument()

      act(() => writePlanState(fromAccount))

      expect(screen.queryByTestId('welcome-screen')).toBeNull()
      expect(screen.queryByTestId('starting-point')).toBeNull()
      expect(screen.queryByTestId('time-question')).toBeNull()
      expect(screen.getByTestId('training-plan')).toBeInTheDocument()
      // The account's own plan: its start, its goal, its time.
      expect(upNextTitle()).toBe('True count')
      expect(within(screen.getByTestId('plan-goal')).getByText('Bet spread')).toBeInTheDocument()
      expect(screen.getByTestId('plan-pace')).toHaveTextContent('4 days a week · 30 min')
      expect(within(screen.getByTestId('plan-stage-rules')).queryByTestId('plan-mark-read-rules')).toBeNull()
    })

    it('leaves the starting question the moment they land, if it was already showing', () => {
      // Greeted on this device a second ago, then the merge arrives.
      render(<TrainingPlan />)
      expect(screen.getByTestId('starting-point')).toBeInTheDocument()

      act(() => writePlanState(fromAccount))

      expect(screen.queryByTestId('starting-point')).toBeNull()
      expect(upNextTitle()).toBe('True count')
    })

    it('does not ask again on the next mount either', () => {
      localStorage.clear()
      const { unmount } = render(<TrainingPlan />)
      act(() => writePlanState(fromAccount))
      unmount()

      render(<TrainingPlan />)
      expect(screen.queryByTestId('welcome-screen')).toBeNull()
      expect(screen.queryByTestId('starting-point')).toBeNull()
      expect(screen.getByTestId('training-plan')).toBeInTheDocument()
    })

    it('does not stamp the arriving answers as given just now', () => {
      localStorage.clear()
      render(<TrainingPlan />)
      act(() => writePlanState(fromAccount))
      // Rendering the plan from them must not count as answering: the stamp
      // is what the next merge trusts.
      expect(readPlanState().updatedAt).toBe(fromAccount.updatedAt)
    })

    it('follows a decline that arrives from the account', () => {
      localStorage.clear()
      render(<TrainingPlan />)
      act(() => writePlanState({
        ...fromAccount, placement: null, profile: null, startLevel: null, skipped: true, readStages: [],
      }))

      expect(screen.queryByTestId('welcome-screen')).toBeNull()
      expect(screen.queryByTestId('starting-point')).toBeNull()
      expect(upNextTitle()).toBe('The game itself')
      expect(screen.getByTestId('plan-take-test')).toBeInTheDocument()
    })
  })

  describe('a learner with training on record and no stored answers', () => {
    // An account that trained before its answers travelled with it arrives
    // with sessions and no placement. Its history has already answered "have
    // you ever played?".
    beforeEach(() => {
      localStorage.clear() // not greeted, not placed, not skipped
      useStatsStore.setState({ sessions: [agedSession(2, 'speedDrill', 0.5)] })
    })

    it('is shown the plan from the first stage, not the welcome or the question', () => {
      render(<TrainingPlan />)

      expect(screen.queryByTestId('welcome-screen')).toBeNull()
      expect(screen.queryByTestId('starting-point')).toBeNull()
      expect(screen.getByTestId('training-plan')).toBeInTheDocument()
      expect(upNextTitle()).toBe('The game itself')
      expect(screen.getByText(`0 of ${CURRICULUM.length} stages complete`)).toBeInTheDocument()
      // Nothing was skipped by a placement, because there was none.
      expect(screen.queryByText('skipped by placement')).toBeNull()
    })

    it('needs only one session for that, of any kind and any result', () => {
      useStatsStore.setState({ sessions: [agedSession(40, 'casinoSession', 0)] })
      render(<TrainingPlan />)
      expect(screen.queryByTestId('welcome-screen')).toBeNull()
      expect(screen.queryByTestId('starting-point')).toBeNull()
      expect(screen.getByTestId('training-plan')).toBeInTheDocument()
    })

    it('carries its real progress on that plan', () => {
      useStatsStore.setState({ sessions: finishing('hi-lo', 'speedDrill', 0.95, 1) })
      render(<TrainingPlan />)

      const { minSessions, minDays } = drillOf('hi-lo')
      expect(screen.getByTestId('plan-stage-hi-lo').textContent)
        .toContain(`${minSessions}/${minSessions} · ${minDays}/${minDays} days`)
      expect(screen.getByText(`1 of ${CURRICULUM.length} stages complete`)).toBeInTheDocument()
    })

    it('records no decline on its behalf', () => {
      // Shown the plan because of the history, not because anything was
      // answered: nothing is written.
      render(<TrainingPlan />)
      expect(hasSkippedPlacement()).toBe(false)
      expect(getPlacement()).toBeNull()
      expect(getProfile()).toBeNull()
    })

    it('keeps the choice of a starting point one click away, from the banner', () => {
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('plan-take-test'))
      expect(screen.getByTestId('starting-point')).toBeInTheDocument()
      expect(screen.queryByTestId('welcome-screen')).toBeNull()

      fireEvent.click(screen.getByTestId('entry-counting'))
      expect(getPlacement()).toBe('true-count')
      fireEvent.click(screen.getByTestId('time-question-done'))
      expect(upNextTitle()).toBe('True count')
    })

    it('keeps it one click away from the foot of the list too, and lets them back out', () => {
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('plan-retake'))
      expect(screen.getByTestId('starting-point')).toBeInTheDocument()

      fireEvent.click(screen.getByTestId('starting-point-skip'))
      expect(screen.getByTestId('training-plan')).toBeInTheDocument()
      expect(getPlacement()).toBeNull()
    })

    it('still greets and asks an account with no sessions at all', () => {
      useStatsStore.setState({ sessions: [] })
      render(<TrainingPlan />)
      expect(screen.getByTestId('welcome-screen')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('welcome-start'))
      expect(screen.getByTestId('starting-point')).toBeInTheDocument()
    })
  })

  describe('embedded in the home screen', () => {
    beforeEach(() => {
      localStorage.setItem('bjt_placement', 'hi-lo')
    })

    it('shows the road as a strip of seven points, not as seven cards', () => {
      render(<TrainingPlan embedded />)

      const path = screen.getByTestId('plan-path')
      CURRICULUM.forEach(s => {
        expect(within(path).getByTestId(`path-node-${s.id}`)).toBeInTheDocument()
        expect(screen.queryByTestId(`plan-stage-${s.id}`)).toBeNull()
      })
      // What belongs to the plan's own page stays there.
      expect(screen.queryByTestId('plan-retake')).toBeNull()
      expect(screen.queryByTestId('plan-daily-challenge')).toBeNull()
    })

    it('keeps the strip off the plan’s own page, where the cards are', () => {
      render(<TrainingPlan />)
      expect(screen.queryByTestId('plan-path')).toBeNull()
      expect(screen.getByTestId('plan-stage-hi-lo')).toBeInTheDocument()
    })

    it('marks each point: behind the placement, on turn, still ahead', () => {
      render(<TrainingPlan embedded />)
      const stateOf = (id: StageId) => screen.getByTestId(`path-node-${id}`).getAttribute('data-state')
      expect(stateOf('rules')).toBe('done')
      expect(stateOf('basic-strategy')).toBe('done')
      expect(stateOf('hi-lo')).toBe('active')
      for (const id of ['true-count', 'deviations', 'bet-spread', 'table'] as const) {
        expect(stateOf(id), id).toBe('ahead')
      }
    })

    it('moves the active point on as a stage is finished', () => {
      useStatsStore.setState({ sessions: finishing('hi-lo', 'speedDrill', 0.95) })
      render(<TrainingPlan embedded />)
      expect(screen.getByTestId('path-node-hi-lo')).toHaveAttribute('data-state', 'done')
      expect(screen.getByTestId('path-node-true-count')).toHaveAttribute('data-state', 'active')
    })

    it('shows sessions and days on the point being worked on', () => {
      const { minSessions, minDays } = drillOf('hi-lo')
      useStatsStore.setState({ sessions: many(2, 'speedDrill', 0.95) })
      render(<TrainingPlan embedded />)
      expect(screen.getByTestId('path-node-hi-lo'))
        .toHaveTextContent(`2/${minSessions} · 1/${minDays} days`)
    })

    it('opens the full plan from the strip', () => {
      useAppStore.setState({ currentMode: 'home' })
      render(<TrainingPlan embedded />)
      fireEvent.click(screen.getByTestId('plan-path-open'))
      expect(useAppStore.getState().currentMode).toBe('plan')
    })

    it('still carries today’s session, with its start button', () => {
      render(<TrainingPlan embedded />)
      expect(within(screen.getByTestId('plan-up-next')).getByTestId('plan-today')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('plan-block-work'))
      expect(useAppStore.getState().currentMode).toBe('speedDrill')
    })

    it('forecasts the weeks to the goal beside the stage count', () => {
      render(<TrainingPlan embedded />)
      expect(screen.getByTestId('plan-forecast').textContent).toMatch(/About \d+ weeks? to your goal/)
    })

    it('renders the page’s slots around the plan', () => {
      render(
        <TrainingPlan
          embedded
          before={<div data-testid="slot-before" />}
          after={<div data-testid="slot-after" />}
        />,
      )
      const plan = screen.getByTestId('training-plan')
      expect(within(plan).getByTestId('slot-before')).toBeInTheDocument()
      expect(within(plan).getByTestId('slot-after')).toBeInTheDocument()
    })

    describe('how this works', () => {
      it('explains the plan to a new account that has not trained yet', () => {
        render(<TrainingPlan embedded />)
        const card = screen.getByTestId('how-it-works')
        expect(card).toHaveTextContent('How this works')
        expect(card).toHaveTextContent('several different days')
      })

      it('goes away for good once dismissed', () => {
        const { unmount } = render(<TrainingPlan embedded />)
        fireEvent.click(screen.getByTestId('how-it-works-dismiss'))
        expect(screen.queryByTestId('how-it-works')).toBeNull()
        expect(isRecommendationDone()).toBe(true)
        unmount()

        render(<TrainingPlan embedded />)
        expect(screen.queryByTestId('how-it-works')).toBeNull()
      })

      it('offers the tour only where the page has one, and starting it puts the card away', () => {
        const { unmount } = render(<TrainingPlan embedded />)
        expect(screen.queryByTestId('how-it-works-tour')).toBeNull()
        unmount()

        const onTour = vi.fn()
        render(<TrainingPlan embedded onTour={onTour} />)
        fireEvent.click(screen.getByTestId('how-it-works-tour'))
        expect(onTour).toHaveBeenCalledTimes(1)
        expect(screen.queryByTestId('how-it-works')).toBeNull()
        expect(isRecommendationDone()).toBe(true)
      })

      it('is not shown to someone who has already trained', () => {
        useStatsStore.setState({ sessions: [agedSession(1, 'speedDrill', 0.5)] })
        render(<TrainingPlan embedded />)
        expect(screen.queryByTestId('how-it-works')).toBeNull()
      })

      it('is not shown on the plan’s own page', () => {
        render(<TrainingPlan />)
        expect(screen.queryByTestId('how-it-works')).toBeNull()
      })

      it('is not shown again to an account that dismissed it on another device', () => {
        localStorage.setItem('bjt_recommendation_done', '1')
        render(<TrainingPlan embedded />)
        expect(screen.queryByTestId('how-it-works')).toBeNull()
      })
    })
  })

  it('returns to the assessment on retake', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    render(<TrainingPlan />)

    fireEvent.click(screen.getByTestId('plan-retake'))
    expect(screen.getByTestId('starting-point')).toBeInTheDocument()
  })
})
