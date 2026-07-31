import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { TrainingPlan } from './TrainingPlan'
import { useAppStore } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import { useUpgradePrompt } from '../../store/upgrade-prompt-store'
import { useChallengeStore } from '../../store/challenge-store'
import { stageXP } from '../../services/stage-rewards'
import { getPlacement, getReadStages, hasSkippedPlacement, CURRICULUM } from '../../services/curriculum'
import { getProfile } from '../../services/learner-profile'
import { buildChecks } from '../../services/skill-assessment'
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
    expect(screen.queryByTestId('skill-assessment')).toBeNull()

    fireEvent.click(screen.getByTestId('welcome-start'))
    expect(screen.getByTestId('skill-assessment')).toBeInTheDocument()
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
    expect(screen.getByTestId('skill-assessment')).toBeInTheDocument()
  })

  it('does not greet a placed learner who is retaking the test', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    render(<TrainingPlan />)
    fireEvent.click(screen.getByTestId('plan-retake'))
    expect(screen.queryByTestId('welcome-screen')).toBeNull()
    expect(screen.getByTestId('skill-assessment')).toBeInTheDocument()
  })

  it('sends an unplaced user to the assessment after the greeting', () => {
    localStorage.setItem('bjt_welcome_seen', 'true')
    render(<TrainingPlan />)
    expect(screen.getByTestId('skill-assessment')).toBeInTheDocument()
    expect(screen.queryByTestId('training-plan')).not.toBeInTheDocument()
  })

  it('walks assessment → result → plan, and remembers the placement', () => {
    render(<TrainingPlan />)

    const checks = buildChecks()
    // Intent first: everyone answers what they want and how much time they have.
    fireEvent.click(screen.getByTestId('goal-serious'))
    fireEvent.click(screen.getByTestId('time-casual'))
    fireEvent.click(screen.getByTestId('casino-never'))
    fireEvent.click(screen.getByTestId('maths-okay'))
    fireEvent.click(screen.getByTestId('source-search'))
    fireEvent.click(screen.getByTestId('entry-new'))
    // Answer everything wrong — a true beginner lands at the rules.
    for (let i = 0; i < 10; i++) {
      const on = checks.find(c => screen.queryByTestId(`check-${c.stage}-${c.options[0]}`))
      if (!on) break
      fireEvent.click(screen.getByTestId(`check-${on.stage}-${on.options.find(o => o !== on.correct)}`))
      fireEvent.click(screen.getByTestId('check-next'))
    }

    expect(screen.getByTestId('placement-result')).toBeInTheDocument()
    expect(getPlacement()).toBe('rules')

    fireEvent.click(screen.getByTestId('placement-start'))
    expect(screen.getByTestId('training-plan')).toBeInTheDocument()
  })

  it('shows the whole path with the placed stage up next', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    render(<TrainingPlan />)

    CURRICULUM.forEach(s => {
      expect(screen.getByTestId(`plan-stage-${s.id}`)).toBeInTheDocument()
    })
    const upNext = screen.getByTestId('plan-up-next')
    expect(within(upNext).getByText('The Hi-Lo count')).toBeInTheDocument()
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
    // Three Speed Drills above the 90% bar finish the Hi-Lo stage.
    useStatsStore.setState({ sessions: many(3, 'speedDrill', 0.95) })
    render(<TrainingPlan />)

    expect(within(screen.getByTestId('plan-up-next')).getByText('True count')).toBeInTheDocument()
    expect(screen.getByText('1 of 5 stages complete')).toBeInTheDocument()
  })

  it('does not count sessions that missed the accuracy bar', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    useStatsStore.setState({ sessions: many(3, 'speedDrill', 0.6) })
    render(<TrainingPlan />)

    expect(within(screen.getByTestId('plan-up-next')).getByText('The Hi-Lo count')).toBeInTheDocument()
    expect(screen.getByText('0 of 5 stages complete')).toBeInTheDocument()
  })

  it('sends a drill button to its own screen', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    render(<TrainingPlan />)

    fireEvent.click(screen.getByTestId('plan-drill-hi-lo'))
    expect(useAppStore.getState().currentMode).toBe('speedDrill')
  })

  it('ticks a reading stage off when the user confirms it', () => {
    localStorage.setItem('bjt_placement', 'rules')
    render(<TrainingPlan />)

    expect(within(screen.getByTestId('plan-up-next')).getByText('The game itself')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('plan-mark-read-rules'))

    expect(getReadStages()).toEqual(['rules'])
    // The screen moves on without a reload.
    expect(within(screen.getByTestId('plan-up-next')).getByText('Basic strategy')).toBeInTheDocument()
  })

  it('offers the paywall instead of a drill on a Pro stage', () => {
    proState.isPro = false
    localStorage.setItem('bjt_placement', 'bet-spread')
    render(<TrainingPlan />)

    expect(screen.queryByTestId('plan-drill-bet-spread')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('plan-unlock-bet-spread'))

    const prompt = useUpgradePrompt.getState()
    expect(prompt.open).toBe(true)
    expect(prompt.headline).toContain('Bet spread')
  })

  it('drills a Pro stage directly once the user is Pro', () => {
    localStorage.setItem('bjt_placement', 'bet-spread')
    render(<TrainingPlan />)

    expect(screen.queryByTestId('plan-unlock-bet-spread')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('plan-drill-bet-spread'))
    expect(useAppStore.getState().currentMode).toBe('betSpread')
  })

  it('celebrates a finished path instead of leaving up next empty', () => {
    localStorage.setItem('bjt_placement', 'bet-spread')
    useStatsStore.setState({
      sessions: [...many(3, 'betSpread', 0.9), ...many(3, 'casinoSession', 1)],
    })
    render(<TrainingPlan />)

    expect(screen.getByTestId('plan-complete')).toBeInTheDocument()
    expect(screen.queryByTestId('plan-up-next')).not.toBeInTheDocument()
    expect(screen.getByText('2 of 2 stages complete')).toBeInTheDocument()
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
        id: 'test', title: 'Count a shoe', description: '', icon: '🎯',
        type: 'play_sessions', difficulty: 'medium', target: 2,
        progressMode: 'cumulative_today', requiredMode: 'speedDrill',
      },
      state: { challengeId: 'test', date: '2026-07-22', progress: 1, completed: false, completedAt: null },
    })
    render(<TrainingPlan />)

    const card = screen.getByTestId('plan-daily-challenge')
    expect(within(card).getByText('Count a shoe')).toBeInTheDocument()
    expect(within(card).getByText('+100 XP')).toBeInTheDocument()
  })

  it('sends the challenge card to the screen the challenge needs', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    useChallengeStore.setState({
      challenge: {
        id: 'test', title: 'Flashcards', description: '', icon: '🎯',
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
      sessions: [...many(3, 'betSpread', 0.9), ...many(3, 'casinoSession', 1)],
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
    expect(within(screen.getByTestId('plan-up-next')).getByText('True count')).toBeInTheDocument()
    expect(screen.getByTestId('plan-unlock-true-count')).toBeInTheDocument()

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

    it('changes the weekly pace and the target moves with it', () => {
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('plan-pace'))
      const before = screen.getByTestId('plan-pace').textContent
      fireEvent.click(screen.getByTestId('plan-set-pace-heavy'))

      expect(getProfile()?.commitment).toBe('heavy')
      expect(screen.getByTestId('plan-pace').textContent).not.toBe(before)
    })

    it('keeps completed work when the goal changes', () => {
      useStatsStore.setState({ sessions: many(3, 'speedDrill', 0.95) })
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
    useStatsStore.setState({ sessions: many(3, 'deckEstimation', 0.9) })
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
      sessions: [...many(3, 'betSpread', 0.9), ...many(3, 'casinoSession', 1)],
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
      expect(within(screen.getByTestId('plan-up-next')).getByText('The Hi-Lo count')).toBeInTheDocument()
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
      expect(screen.getByTestId('plan-standing').textContent).toMatch(/1 of 3 sessions cleared/)
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
      expect(screen.getByTestId('assessment-skip')).toBeInTheDocument()
    })

    it('stops offering the exit once answering has begun', () => {
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('goal-curious'))
      expect(screen.queryByTestId('assessment-skip')).toBeNull()
    })

    it('shows the real plan to someone who skipped, not an empty shell', () => {
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('assessment-skip'))

      expect(screen.getByTestId('training-plan')).toBeInTheDocument()
      // The whole path, from the beginning — the curriculum is a fact about
      // card counting, not a personalisation.
      CURRICULUM.forEach(s => expect(screen.getByTestId(`plan-stage-${s.id}`)).toBeInTheDocument())
      expect(within(screen.getByTestId('plan-up-next')).getByText('The game itself')).toBeInTheDocument()
      expect(screen.getByText(`0 of ${CURRICULUM.length} stages complete`)).toBeInTheDocument()
    })

    it('claims nothing was skipped when no test was taken', () => {
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('assessment-skip'))
      expect(screen.queryByText('skipped by placement')).toBeNull()
    })

    it('remembers the decision instead of asking again', () => {
      const { unmount } = render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('assessment-skip'))
      expect(hasSkippedPlacement()).toBe(true)
      unmount()

      render(<TrainingPlan />)
      expect(screen.getByTestId('training-plan')).toBeInTheDocument()
      expect(screen.queryByTestId('skill-assessment')).toBeNull()
    })

    it('keeps the test one click away, and taking it works', () => {
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('assessment-skip'))

      fireEvent.click(screen.getByTestId('plan-take-test'))
      expect(screen.getByTestId('skill-assessment')).toBeInTheDocument()
      expect(hasSkippedPlacement()).toBe(false)
    })

    it('lets an unplaced learner start a drill straight away', () => {
      render(<TrainingPlan />)
      fireEvent.click(screen.getByTestId('assessment-skip'))
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
      useStatsStore.setState({ sessions: manyAged(3, 30, 'speedDrill', 0.95) })
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
      useStatsStore.setState({ sessions: manyAged(3, 30, 'deckEstimation', 0.9) })
      render(<TrainingPlan />)
      expect(screen.queryByTestId('plan-warm-up')).toBeNull()
    })

    it('leaves the plan itself untouched — the notice is context, not a detour', () => {
      useStatsStore.setState({ sessions: manyAged(3, 30, 'speedDrill', 0.95) })
      render(<TrainingPlan />)

      expect(within(screen.getByTestId('plan-up-next')).getByText('True count')).toBeInTheDocument()
      expect(screen.getByText('1 of 5 stages complete')).toBeInTheDocument()
    })
  })

  it('returns to the assessment on retake', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    render(<TrainingPlan />)

    fireEvent.click(screen.getByTestId('plan-retake'))
    expect(screen.getByTestId('skill-assessment')).toBeInTheDocument()
  })
})
