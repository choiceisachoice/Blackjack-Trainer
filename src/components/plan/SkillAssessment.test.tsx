import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { SkillAssessment, PlacementResult } from './SkillAssessment'
import {
  ENTRY_OPTIONS,
  buildChecks,
  placeFromAnswers,
  type CheckQuestion,
} from '../../services/skill-assessment'
import { CURRICULUM, stageIndex } from '../../services/curriculum'
import {
  GOAL_OPTIONS,
  COMMITMENT_OPTIONS,
  estimateToGoal,
  goalStage,
  type LearnerProfile,
} from '../../services/learner-profile'

/** A complete profile, so tests state only the field they care about. */
const profileOf = (over: Partial<LearnerProfile> = {}): LearnerProfile => ({
  goal: 'serious', commitment: 'casual', casino: 'never', maths: 'okay', source: 'other', ...over,
})
const PROFILE = profileOf()

const CHECKS = buildChecks()
const byStage = (s: string) => CHECKS.find(c => c.stage === s)!

/**
 * Answer the two intent questions so the experience ladder is on screen.
 *
 * Intent comes first for everyone now, so almost every test needs this.
 */
function openLadder(goal = 'serious', time = 'casual') {
  fireEvent.click(screen.getByTestId(`goal-${goal}`))
  fireEvent.click(screen.getByTestId(`time-${time}`))
  fireEvent.click(screen.getByTestId('casino-never'))
  fireEvent.click(screen.getByTestId('maths-okay'))
  fireEvent.click(screen.getByTestId('source-search'))
}

/** The check currently on screen, found by its stage heading. */
function visibleCheck(): CheckQuestion {
  const found = CHECKS.find(c => screen.queryByTestId(`check-${c.stage}-${c.options[0]}`))
  if (!found) throw new Error('no check on screen')
  return found
}

/** Answer whatever is on screen and continue. */
function answerVisible(policy: (c: CheckQuestion) => string): CheckQuestion {
  const check = visibleCheck()
  fireEvent.click(screen.getByTestId(`check-${check.stage}-${policy(check)}`))
  fireEvent.click(screen.getByTestId('check-next'))
  return check
}

/** Run the whole flow from an entry option, returning the stages asked. */
function runFlow(entry: string, policy: (c: CheckQuestion) => string): CheckQuestion[] {
  openLadder()
  fireEvent.click(screen.getByTestId(`entry-${entry}`))
  const asked: CheckQuestion[] = []
  for (let i = 0; i < 10; i++) {
    try {
      asked.push(answerVisible(policy))
    } catch {
      break
    }
  }
  return asked
}

const right = (c: CheckQuestion) => c.correct
const wrong = (c: CheckQuestion) => c.options.find(o => o !== c.correct)!

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SkillAssessment', () => {
  it('opens by asking what the learner wants, not what they know', () => {
    // Everyone can answer this. The experience ladder needs words like "count"
    // to mean something, so it cannot be the first thing a beginner meets.
    render(<SkillAssessment onDone={vi.fn()} />)
    expect(screen.getByTestId('skill-assessment')).toBeInTheDocument()
    expect(screen.getByText('What do you want out of this?')).toBeInTheDocument()
    for (const o of GOAL_OPTIONS) {
      expect(screen.getByTestId(`goal-${o.value}`)).toBeInTheDocument()
    }
    // No skill question anywhere yet.
    expect(screen.queryByTestId('entry-new')).toBeNull()
  })

  it('asks about time before ability', () => {
    render(<SkillAssessment onDone={vi.fn()} />)
    fireEvent.click(screen.getByTestId('goal-curious'))

    expect(screen.getByText('How much time can you give it?')).toBeInTheDocument()
    for (const o of COMMITMENT_OPTIONS) {
      expect(screen.getByTestId(`time-${o.value}`)).toBeInTheDocument()
    }
    expect(screen.queryByTestId('entry-new')).toBeNull()
  })

  it('reaches the experience ladder only after both intent answers', () => {
    render(<SkillAssessment onDone={vi.fn()} />)
    openLadder()
    expect(screen.getByText('How much blackjack do you already know?')).toBeInTheDocument()
    for (const o of ENTRY_OPTIONS) {
      expect(screen.getByTestId(`entry-${o.value}`)).toBeInTheDocument()
    }
  })

  it('describes every ladder rung without assuming the vocabulary', () => {
    // A beginner has to be able to read every option honestly. None of the
    // labels may lean on a term the app has not taught yet.
    const jargon = /true count|running count|deviation|illustrious|hi-lo|basic strategy/i
    for (const o of ENTRY_OPTIONS) {
      expect(o.label, o.value).not.toMatch(jargon)
    }
  })

  it('carries every intent answer through to the caller', () => {
    const onDone = vi.fn()
    render(<SkillAssessment onDone={onDone} />)
    fireEvent.click(screen.getByTestId('goal-profit'))
    fireEvent.click(screen.getByTestId('time-regular'))
    fireEvent.click(screen.getByTestId('casino-real'))
    fireEvent.click(screen.getByTestId('maths-slow'))
    fireEvent.click(screen.getByTestId('source-video'))
    fireEvent.click(screen.getByTestId('entry-new'))

    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ stage: 'rules' }), {
      goal: 'profit', commitment: 'regular', casino: 'real', maths: 'slow', source: 'video',
    })
  })

  it('asks a declared beginner every universal question anyway', () => {
    // Someone who knows nothing still has a goal, a schedule and a history —
    // those are the questions that make the plan theirs.
    render(<SkillAssessment onDone={vi.fn()} />)
    const seen: string[] = []
    for (const [prefix, value] of [
      ['goal', 'curious'], ['time', 'light'], ['casino', 'never'],
      ['maths', 'slow'], ['source', 'friend'],
    ]) {
      const title = screen.getByRole('heading', { level: 1 }).textContent!
      seen.push(title)
      fireEvent.click(screen.getByTestId(`${prefix}-${value}`))
    }
    expect(seen).toHaveLength(5)
    expect(new Set(seen).size).toBe(5) // five distinct questions, no repeats
    // ...and only then the ladder.
    expect(screen.getByTestId('entry-new')).toBeInTheDocument()
  })

  it('warns a learner who already plays for money, and nobody else', () => {
    const placement = placeFromAnswers('rules', [], CHECKS)
    const { unmount } = render(
      <PlacementResult placement={placement} profile={profileOf({ casino: 'real' })} onStart={vi.fn()} />,
    )
    expect(screen.getByTestId('placement-money-note')).toBeInTheDocument()
    unmount()

    render(<PlacementResult placement={placement} profile={profileOf({ casino: 'online' })} onStart={vi.fn()} />)
    expect(screen.queryByTestId('placement-money-note')).toBeNull()
  })

  it('takes a declared beginner straight to the plan without a single question', () => {
    // Regression: the probe converges immediately for this option, and the
    // screen used to render neither the ladder nor a question — a dead end.
    const onDone = vi.fn()
    render(<SkillAssessment onDone={onDone} />)
    openLadder()
    fireEvent.click(screen.getByTestId('entry-new'))

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'rules', asked: 0 }),
      expect.objectContaining({ goal: 'serious' }),
    )
  })

  it('leaves no dead end for any entry option', () => {
    // Every option must lead somewhere: a question, or a finished placement.
    for (const option of ENTRY_OPTIONS) {
      const onDone = vi.fn()
      const { unmount } = render(<SkillAssessment onDone={onDone} />)
      openLadder()
      fireEvent.click(screen.getByTestId(`entry-${option.value}`))

      const askedSomething = CHECKS.some(c => screen.queryByTestId(`check-${c.stage}-${c.options[0]}`))
      expect(askedSomething || onDone.mock.calls.length === 1, option.value).toBe(true)
      unmount()
    }
  })

  it('opens by asking the learner to back up their own claim', () => {
    render(<SkillAssessment onDone={vi.fn()} />)
    openLadder()
    fireEvent.click(screen.getByTestId('entry-table'))

    // "I've counted for money at a real table" claims bet spread — so that is
    // what gets checked first, not what a bust is.
    expect(visibleCheck().stage).toBe('bet-spread')
  })

  it('never opens with the thing the learner just said they cannot do', () => {
    render(<SkillAssessment onDone={vi.fn()} />)
    openLadder()
    fireEvent.click(screen.getByTestId('entry-strategy'))

    // They claimed basic strategy and disclaimed counting.
    expect(visibleCheck().stage).toBe('basic-strategy')
  })

  it('agrees with an honest learner in two questions', () => {
    const onDone = vi.fn()
    render(<SkillAssessment onDone={onDone} />)
    // Claims basic strategy, cannot count.
    const asked = runFlow('strategy', c => (c.stage === 'basic-strategy' ? right(c) : wrong(c)))

    expect(asked.map(c => c.stage)).toEqual(['basic-strategy', 'hi-lo'])
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ stage: 'hi-lo' }), expect.anything())
  })

  it('draws the situation instead of describing it', () => {
    render(<SkillAssessment onDone={vi.fn()} />)
    openLadder()
    fireEvent.click(screen.getByTestId('entry-strategy'))

    // The basic-strategy check shows the hand and the dealer upcard.
    expect(screen.getByTestId('check-situation')).toBeInTheDocument()
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('Dealer shows')).toBeInTheDocument()
    expect(screen.getByText('soft 18')).toBeInTheDocument()
  })

  it('shows the count state on questions that need it', () => {
    render(<SkillAssessment onDone={vi.fn()} />)
    openLadder()
    fireEvent.click(screen.getByTestId('entry-truecount'))

    expect(screen.getByText('Running count')).toBeInTheDocument()
    expect(screen.getByText('Decks left')).toBeInTheDocument()
  })

  it('reveals the right answer and the reasoning after a wrong one', () => {
    render(<SkillAssessment onDone={vi.fn()} />)
    openLadder()
    fireEvent.click(screen.getByTestId('entry-rules'))

    const check = visibleCheck()
    expect(screen.queryByTestId('check-explanation')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId(`check-${check.stage}-${wrong(check)}`))

    expect(screen.getByTestId('check-explanation')).toBeInTheDocument()
    expect(screen.getByText('Not quite.')).toBeInTheDocument()
    expect(screen.getByText(check.explanation)).toBeInTheDocument()
  })

  it('confirms a correct answer', () => {
    render(<SkillAssessment onDone={vi.fn()} />)
    openLadder()
    fireEvent.click(screen.getByTestId('entry-rules'))
    const check = visibleCheck()
    fireEvent.click(screen.getByTestId(`check-${check.stage}-${check.correct}`))

    expect(screen.getByText('Correct.')).toBeInTheDocument()
  })

  it('locks the choices once answered, so a guess cannot be corrected', () => {
    render(<SkillAssessment onDone={vi.fn()} />)
    openLadder()
    fireEvent.click(screen.getByTestId('entry-rules'))
    const check = visibleCheck()

    fireEvent.click(screen.getByTestId(`check-${check.stage}-${wrong(check)}`))
    fireEvent.click(screen.getByTestId(`check-${check.stage}-${check.correct}`))

    expect(screen.getByText('Not quite.')).toBeInTheDocument()
  })

  it('asks harder questions after a right answer and easier ones after a wrong one', () => {
    // This is the whole point of the rewrite: the next question depends on the
    // last answer. The old fixed list did the same thing regardless.
    const { unmount } = render(<SkillAssessment onDone={vi.fn()} />)
    openLadder()
    fireEvent.click(screen.getByTestId('entry-strategy'))
    const start = visibleCheck()
    answerVisible(right)
    const afterRight = visibleCheck()
    expect(stageIndex(afterRight.stage)).toBeGreaterThan(stageIndex(start.stage))
    unmount()

    render(<SkillAssessment onDone={vi.fn()} />)
    openLadder()
    fireEvent.click(screen.getByTestId('entry-strategy'))
    answerVisible(wrong)
    const afterWrong = visibleCheck()
    expect(stageIndex(afterWrong.stage)).toBeLessThan(stageIndex(start.stage))
  })

  it('agrees with the placement service for the same answers', () => {
    const onDone = vi.fn()
    render(<SkillAssessment onDone={onDone} />)

    const asked = runFlow('strategy', c => (c.stage === 'deviations' ? wrong(c) : right(c)))

    // Independent oracle: replay the same answers through the service.
    const expected = placeFromAnswers(
      ENTRY_OPTIONS.find(o => o.value === 'strategy')!.stage,
      asked.map(c => ({
        stage: c.stage,
        chosen: c.stage === 'deviations' ? wrong(c) : right(c),
      })),
      CHECKS,
    )
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith(expected, expect.anything())
  })

  it('finishes only once the search has converged', () => {
    const onDone = vi.fn()
    render(<SkillAssessment onDone={onDone} />)

    openLadder()

    fireEvent.click(screen.getByTestId('entry-rules'))
    answerVisible(right)
    expect(onDone).not.toHaveBeenCalled()

    runFlow0(right)
    expect(onDone).toHaveBeenCalledTimes(1)

    function runFlow0(policy: (c: CheckQuestion) => string) {
      for (let i = 0; i < 10; i++) {
        try { answerVisible(policy) } catch { return }
      }
    }
  })

  it('never asks more than four questions', () => {
    for (const option of ENTRY_OPTIONS) {
      const { unmount } = render(<SkillAssessment onDone={vi.fn()} />)
      expect(runFlow(option.value, right).length, option.value).toBeLessThanOrEqual(4)
      unmount()
    }
  })

  it('lets someone who undersells answer their way to the top', () => {
    const onDone = vi.fn()
    render(<SkillAssessment onDone={onDone} />)
    runFlow('rules', right)
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ stage: 'table' }), expect.anything())
  })

  it('sends an overconfident answerer back to the beginning', () => {
    const onDone = vi.fn()
    render(<SkillAssessment onDone={onDone} />)
    runFlow('table', wrong)
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ stage: 'rules' }), expect.anything())
  })
})

describe('the check content', () => {
  it('renders every check without crashing', () => {
    // Walk each entry option all the way through, answering correctly, which
    // between them puts every check on screen at least once.
    const seen = new Set<string>()
    for (const option of ENTRY_OPTIONS) {
      const { unmount } = render(<SkillAssessment onDone={vi.fn()} />)
      for (const c of runFlow(option.value, right)) {
        expect(screen.queryByTestId('skill-assessment')).toBeTruthy()
        seen.add(c.stage)
      }
      unmount()
    }
    expect(seen.size).toBe(CHECKS.length)
  })

  it('shows the counting question as a row of cards with no tags given away', () => {
    render(<SkillAssessment onDone={vi.fn()} />)
    openLadder()
    fireEvent.click(screen.getByTestId('entry-strategy'))
    answerVisible(right) // basic strategy confirmed → counting is next

    const hiLo = byStage('hi-lo')
    expect(screen.getByText(hiLo.prompt)).toBeInTheDocument()
    expect(screen.getByTestId('check-situation')).toBeInTheDocument()
    // Printing the Hi-Lo tag under each card would hand over the answer.
    for (const tag of ['+1', '−1', '0']) {
      expect(within(screen.getByTestId('check-situation')).queryByText(tag)).toBeNull()
    }
  })
})

describe('PlacementResult', () => {
  const placement = placeFromAnswers('hi-lo', [{ stage: 'hi-lo', chosen: byStage('hi-lo').correct }], CHECKS)

  it('names the stage, the reason and the score', () => {
    render(<PlacementResult placement={placement} profile={PROFILE} onStart={vi.fn()} />)

    expect(screen.getByTestId('placement-result')).toBeInTheDocument()
    expect(screen.getByText(CURRICULUM[stageIndex(placement.stage)].title)).toBeInTheDocument()
    expect(screen.getByText(placement.reason)).toBeInTheDocument()
    expect(screen.getByText(`${placement.correct}/${placement.asked}`)).toBeInTheDocument()
  })

  it('reports the score out of what was actually asked, not a fixed count', () => {
    // The test length varies, so "2/3" would be a lie for a three-question run.
    const short = placeFromAnswers('rules', [{ stage: 'rules', chosen: 'wrong' }], CHECKS)
    render(<PlacementResult placement={short} profile={PROFILE} onStart={vi.fn()} />)
    expect(screen.getByText('0/1')).toBeInTheDocument()
  })

  it('says nothing about skipped stages when nothing was skipped', () => {
    const beginner = placeFromAnswers('rules', [{ stage: 'rules', chosen: 'wrong' }], CHECKS)
    render(<PlacementResult placement={beginner} profile={PROFILE} onStart={vi.fn()} />)
    expect(screen.getByTestId('placement-result').textContent).not.toContain('skipped')
  })

  it('names where the plan ends and how long it should take', () => {
    const profile = profileOf({ goal: 'curious', commitment: 'light' })
    render(<PlacementResult placement={placement} profile={profile} onStart={vi.fn()} />)

    const estimate = estimateToGoal(placement.stage, profile.goal, profile.commitment, profile.maths)
    const strip = screen.getByTestId('placement-estimate')
    // Independent oracle: the screen must agree with the service, not just show
    // some plausible-looking numbers.
    expect(strip.textContent).toContain(CURRICULUM[stageIndex(goalStage(profile.goal))].title)
    expect(strip.textContent).toContain(`${estimate.weeks} week`)
    expect(strip.textContent).toContain(`${estimate.sessions}`)
  })

  it('promises less work for a smaller goal', () => {
    const profile = profileOf({ goal: 'curious' })
    const modest = estimateToGoal(placement.stage, 'curious', profile.commitment, profile.maths)
    const full = estimateToGoal(placement.stage, 'serious', profile.commitment, profile.maths)
    expect(modest.sessions).toBeLessThan(full.sessions)

    render(<PlacementResult placement={placement} profile={profile} onStart={vi.fn()} />)
    expect(screen.getByTestId('placement-estimate').textContent).toContain(`${modest.sessions} drills`)
  })

  it('never says "1 weeks"', () => {
    // A plan that opens with a grammar mistake is not a premium product.
    for (const goal of ['curious', 'stop-losing', 'profit', 'serious'] as const) {
      for (const commitment of ['light', 'casual', 'regular', 'heavy'] as const) {
        const { unmount } = render(
          <PlacementResult
            placement={placement}
            profile={profileOf({ goal, commitment })}
            onStart={vi.fn()}
          />,
        )
        const text = screen.getByTestId('placement-estimate').textContent!.replace(/\s+/g, ' ')
        expect(text, `${goal}/${commitment}`).not.toMatch(/\b1 weeks\b/)
        expect(text, `${goal}/${commitment}`).not.toMatch(/\b1 stages\b/)
        expect(text, `${goal}/${commitment}`).not.toMatch(/\b1 drills\b/)
        unmount()
      }
    }
  })

  it('says nothing about an estimate once the goal is already behind them', () => {
    // Clearing every check places you at the terminal stage, which is past a
    // "just curious" goal — there is nothing left to estimate.
    const past = placeFromAnswers('table', CHECKS.map(c => ({ stage: c.stage, chosen: c.correct })), CHECKS)
    expect(past.stage).toBe('table')
    render(<PlacementResult placement={past} profile={profileOf({ goal: 'curious' })} onStart={vi.fn()} />)
    expect(screen.queryByTestId('placement-estimate')).toBeNull()
  })

  it('shows no score when nothing was asked', () => {
    // A declared beginner answers no questions; "0/0 checks correct" would be
    // a nonsense line to greet them with.
    const beginner = placeFromAnswers('rules', [], CHECKS)
    render(<PlacementResult placement={beginner} profile={PROFILE} onStart={vi.fn()} />)
    expect(screen.getByTestId('placement-result').textContent).not.toContain('checks correct')
  })

  it('starts the plan', () => {
    const onStart = vi.fn()
    render(<PlacementResult placement={placement} profile={PROFILE} onStart={onStart} />)
    fireEvent.click(screen.getByTestId('placement-start'))
    expect(onStart).toHaveBeenCalledTimes(1)
  })
})
