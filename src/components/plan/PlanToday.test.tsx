import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { TimeBudgetPicker, TimeQuestion, WeekDots, TodayBlocks, PathStrip, HowItWorks } from './PlanToday'
import { CURRICULUM, deriveCurriculum, type StageId } from '../../services/curriculum'
import { DAY_OPTIONS, MINUTE_OPTIONS, type TimeBudget } from '../../services/learner-profile'
import type { BlockKind, DayPlan, PlanBlock, WeekPlan } from '../../services/daily-plan'
import type { AppMode } from '../../store/app-store'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// ── fixtures ─────────────────────────────────────────────────────────

const MODE: Record<BlockKind, AppMode> = {
  read: 'learn',
  warmup: 'deviationTraining',
  work: 'speedDrill',
  table: 'casinoSession',
}
const STAGE: Record<BlockKind, StageId> = {
  read: 'hi-lo',
  warmup: 'basic-strategy',
  work: 'hi-lo',
  table: 'table',
}

/** One block; the stage and screen follow the kind unless said otherwise. */
function block(kind: BlockKind, done = false, over: Partial<PlanBlock> = {}): PlanBlock {
  return {
    id: `${kind}-${Math.random().toString(36).slice(2)}`,
    kind,
    stage: STAGE[kind],
    mode: MODE[kind],
    minutes: kind === 'table' ? 15 : 5,
    done,
    ...over,
  }
}

/** A day from its blocks, with the sums the real builder would report. */
function day(blocks: PlanBlock[], over: Partial<DayPlan> = {}): DayPlan {
  const next = blocks.find(b => !b.done) ?? null
  return {
    blocks,
    minutes: blocks.reduce((n, b) => n + b.minutes, 0),
    doneMinutes: blocks.filter(b => b.done).reduce((n, b) => n + b.minutes, 0),
    complete: blocks.length > 0 && next === null,
    next,
    focus: 'hi-lo',
    lockedFocus: null,
    ...over,
  }
}

const week = (over: Partial<WeekPlan> = {}): WeekPlan => ({
  target: 3,
  trained: 1,
  met: false,
  days: [true, false, false, false, false, false, false],
  todayIndex: 1,
  ...over,
})

// ── TimeBudgetPicker ─────────────────────────────────────────────────

describe('TimeBudgetPicker', () => {
  const budget: TimeBudget = { daysPerWeek: 3, minutesPerDay: 20 }

  it('offers every number of days and every length of day', () => {
    render(<TimeBudgetPicker budget={budget} onChange={vi.fn()} />)
    for (const d of DAY_OPTIONS) expect(screen.getByTestId(`budget-days-${d}`)).toHaveTextContent(String(d))
    for (const m of MINUTE_OPTIONS) expect(screen.getByTestId(`budget-minutes-${m}`)).toHaveTextContent(`${m} min`)
  })

  it('marks the current answer as pressed, and nothing else', () => {
    render(<TimeBudgetPicker budget={budget} onChange={vi.fn()} />)
    const pressed = screen.getAllByRole('button', { pressed: true }).map(b => b.getAttribute('data-testid'))
    expect(pressed).toEqual(['budget-days-3', 'budget-minutes-20'])
  })

  it('changes the days and leaves the minutes alone', () => {
    const onChange = vi.fn()
    render(<TimeBudgetPicker budget={budget} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('budget-days-6'))
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ daysPerWeek: 6, minutesPerDay: 20 })
  })

  it('changes the minutes and leaves the days alone', () => {
    const onChange = vi.fn()
    render(<TimeBudgetPicker budget={budget} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('budget-minutes-60'))
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ daysPerWeek: 3, minutesPerDay: 60 })
  })

  it('shows what it is given: it holds no answer of its own', () => {
    const { rerender } = render(<TimeBudgetPicker budget={budget} onChange={vi.fn()} />)
    fireEvent.click(screen.getByTestId('budget-days-6'))
    // The parent did not accept the change, so nothing moved.
    expect(screen.getByTestId('budget-days-3')).toHaveAttribute('aria-pressed', 'true')

    rerender(<TimeBudgetPicker budget={{ daysPerWeek: 6, minutesPerDay: 20 }} onChange={vi.fn()} />)
    expect(screen.getByTestId('budget-days-6')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('budget-days-3')).toHaveAttribute('aria-pressed', 'false')
  })

  it('names both rows for a screen reader', () => {
    render(<TimeBudgetPicker budget={budget} onChange={vi.fn()} />)
    expect(screen.getByRole('group', { name: 'Training days a week' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Minutes on a training day' })).toBeInTheDocument()
  })
})

// ── TimeQuestion ─────────────────────────────────────────────────────

describe('TimeQuestion', () => {
  const initial: TimeBudget = { daysPerWeek: 3, minutesPerDay: 20 }
  /** Weeks as a plain function of the days, so the live figure is predictable. */
  const weeks = (b: TimeBudget) => Math.ceil(21 / b.daysPerWeek)

  it('asks the question and opens on the budget it was handed', () => {
    render(<TimeQuestion initial={initial} weeks={weeks} onDone={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'How much time do you have?' })).toBeInTheDocument()
    expect(screen.getByTestId('budget-days-3')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('budget-minutes-20')).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows what the choice costs, and updates it as the choice changes', () => {
    render(<TimeQuestion initial={initial} weeks={weeks} onDone={vi.fn()} />)
    expect(screen.getByTestId('time-question-forecast')).toHaveTextContent('About 7 weeks to your goal')

    fireEvent.click(screen.getByTestId('budget-days-7'))
    expect(screen.getByTestId('time-question-forecast')).toHaveTextContent('About 3 weeks to your goal')
  })

  it('says one week in the singular', () => {
    render(<TimeQuestion initial={initial} weeks={() => 1} onDone={vi.fn()} />)
    expect(screen.getByTestId('time-question-forecast')).toHaveTextContent('About 1 week to your goal')
  })

  it('says nothing about weeks when there is no road left', () => {
    render(<TimeQuestion initial={initial} weeks={() => 0} onDone={vi.fn()} />)
    expect(screen.queryByTestId('time-question-forecast')).toBeNull()
  })

  it('answers nothing until it is confirmed', () => {
    const onDone = vi.fn()
    render(<TimeQuestion initial={initial} weeks={weeks} onDone={onDone} />)
    fireEvent.click(screen.getByTestId('budget-days-5'))
    fireEvent.click(screen.getByTestId('budget-minutes-30'))
    expect(onDone).not.toHaveBeenCalled()
  })

  it('hands over both numbers as chosen', () => {
    const onDone = vi.fn()
    render(<TimeQuestion initial={initial} weeks={weeks} onDone={onDone} />)
    fireEvent.click(screen.getByTestId('budget-days-5'))
    fireEvent.click(screen.getByTestId('budget-minutes-30'))
    fireEvent.click(screen.getByTestId('time-question-done'))
    expect(onDone).toHaveBeenCalledExactlyOnceWith({ daysPerWeek: 5, minutesPerDay: 30 })
  })

  it('hands over the suggestion when it is confirmed untouched', () => {
    const onDone = vi.fn()
    render(<TimeQuestion initial={initial} weeks={weeks} onDone={onDone} />)
    fireEvent.click(screen.getByTestId('time-question-done'))
    expect(onDone).toHaveBeenCalledExactlyOnceWith(initial)
  })
})

// ── WeekDots ─────────────────────────────────────────────────────────

describe('WeekDots', () => {
  it('draws Monday to Sunday, one dot each', () => {
    render(<WeekDots week={week()} />)
    const dots = screen.getByTestId('plan-week')
    expect(dots.querySelectorAll('[data-trained]')).toHaveLength(7)
    // Each dot has its initial under it, in week order.
    const initials = [...dots.querySelectorAll('[data-trained]')]
      .map(dot => dot.nextElementSibling?.textContent)
    expect(initials).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S'])
  })

  it('fills exactly the days that were trained, in their places', () => {
    render(<WeekDots week={week({ days: [true, false, true, false, false, false, true], trained: 3 })} />)
    const flags = [...screen.getByTestId('plan-week').querySelectorAll('[data-trained]')]
      .map(el => el.getAttribute('data-trained'))
    expect(flags).toEqual(['true', 'false', 'true', 'false', 'false', 'false', 'true'])
  })

  it('reads the week out as days trained of days planned', () => {
    render(<WeekDots week={week({ trained: 2, target: 5 })} />)
    expect(screen.getByLabelText('2 of 5 days')).toBe(screen.getByTestId('plan-week'))
  })

  it('draws an empty week without a single filled dot', () => {
    render(<WeekDots week={week({ days: Array(7).fill(false), trained: 0, todayIndex: 0 })} />)
    expect(screen.getByTestId('plan-week').querySelectorAll('[data-trained="true"]')).toHaveLength(0)
  })
})

// ── TodayBlocks ──────────────────────────────────────────────────────

describe('TodayBlocks', () => {
  const rows = () => screen.getAllByTestId(/^plan-block-/)

  it('lists the day in order, one row per kind of block', () => {
    render(
      <TodayBlocks
        day={day([block('warmup'), block('read'), block('work'), block('table')])}
        week={week()}
        onOpen={vi.fn()}
      />,
    )
    expect(rows().map(r => r.getAttribute('data-testid')))
      .toEqual(['plan-block-warmup', 'plan-block-read', 'plan-block-work', 'plan-block-table'])
    expect(screen.getByTestId('plan-block-warmup')).toHaveTextContent('Warm-up')
    expect(screen.getByTestId('plan-block-warmup')).toHaveTextContent('Basic strategy')
    expect(screen.getByTestId('plan-block-read')).toHaveTextContent('Read')
    expect(screen.getByTestId('plan-block-work')).toHaveTextContent('Today’s work')
    expect(screen.getByTestId('plan-block-work')).toHaveTextContent('The Hi-Lo count')
    expect(screen.getByTestId('plan-block-table')).toHaveTextContent('At the table')
    expect(screen.getByTestId('plan-block-table')).toHaveTextContent('15 min')
  })

  it('folds several runs of one drill into one row that says how many', () => {
    // Four runs of the same drill are one line that says "4", not four
    // identical lines.
    render(
      <TodayBlocks
        day={day([block('warmup'), block('work', true), block('work'), block('work'), block('work')])}
        week={week()}
        onOpen={vi.fn()}
      />,
    )
    expect(rows()).toHaveLength(2)
    const work = screen.getByTestId('plan-block-work')
    expect(work).toHaveAttribute('data-runs', '4')
    expect(work).toHaveTextContent('1/4')
    // The row carries the minutes of all its runs.
    expect(work).toHaveTextContent('20 min')
    expect(work).toHaveAttribute('data-done', 'false')
    expect(screen.getByTestId('plan-block-warmup')).toHaveAttribute('data-runs', '1')
  })

  it('folds runs together wherever they sit in the day', () => {
    // Spare slots are added after the reading: still the same drill.
    render(
      <TodayBlocks
        day={day([block('work'), block('read'), block('work')])}
        week={week()}
        onOpen={vi.fn()}
      />,
    )
    expect(rows().map(r => r.getAttribute('data-testid'))).toEqual(['plan-block-work', 'plan-block-read'])
    expect(screen.getByTestId('plan-block-work')).toHaveAttribute('data-runs', '2')
  })

  it('keeps warm-ups of different stages on rows of their own', () => {
    render(
      <TodayBlocks
        day={day([block('warmup'), block('warmup', false, { stage: 'true-count', mode: 'deckEstimation' })])}
        week={week()}
        onOpen={vi.fn()}
      />,
    )
    const warm = screen.getAllByTestId('plan-block-warmup')
    expect(warm).toHaveLength(2)
    expect(warm[0]).toHaveTextContent('Basic strategy')
    expect(warm[1]).toHaveTextContent('True count')
  })

  it('marks a row done only when every run in it is', () => {
    const { rerender } = render(
      <TodayBlocks day={day([block('work', true), block('work', false)])} week={week()} onOpen={vi.fn()} />,
    )
    expect(screen.getByTestId('plan-block-work')).toHaveAttribute('data-done', 'false')

    rerender(
      <TodayBlocks
        day={day([block('work', true), block('work', true), block('table')])}
        week={week()}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByTestId('plan-block-work')).toHaveAttribute('data-done', 'true')
    expect(screen.getByTestId('plan-block-work')).toHaveTextContent('2/2')
  })

  it('opens each row on its own screen — the order is a suggestion', () => {
    const onOpen = vi.fn()
    render(
      <TodayBlocks
        day={day([block('warmup'), block('read'), block('work'), block('table')])}
        week={week()}
        onOpen={onOpen}
      />,
    )
    fireEvent.click(screen.getByTestId('plan-block-table'))
    fireEvent.click(screen.getByTestId('plan-block-work'))
    fireEvent.click(screen.getByTestId('plan-block-read'))
    fireEvent.click(screen.getByTestId('plan-block-warmup'))
    expect(onOpen.mock.calls.map(c => c[0])).toEqual(['casinoSession', 'speedDrill', 'learn', 'deviationTraining'])
  })

  it('starts a fresh day at its first block, by name', () => {
    const onOpen = vi.fn()
    render(<TodayBlocks day={day([block('warmup'), block('work')])} week={week()} onOpen={onOpen} />)
    const start = screen.getByTestId('plan-today-start')
    expect(start).toHaveTextContent('Start: Warm-up · Basic strategy')
    fireEvent.click(start)
    expect(onOpen).toHaveBeenCalledExactlyOnceWith('deviationTraining', expect.objectContaining({ mode: 'deviationTraining' }))
  })

  it('continues a day in progress at the first block still open', () => {
    const onOpen = vi.fn()
    render(
      <TodayBlocks day={day([block('warmup', true), block('work', true), block('work')])} week={week()} onOpen={onOpen} />,
    )
    const start = screen.getByTestId('plan-today-start')
    expect(start).toHaveTextContent('Next: Today’s work · The Hi-Lo count')
    fireEvent.click(start)
    expect(onOpen).toHaveBeenCalledExactlyOnceWith('speedDrill', expect.objectContaining({ mode: 'speedDrill' }))
  })

  it('reports the minutes done against the minutes planned', () => {
    render(
      <TodayBlocks
        day={day([block('warmup', true), block('work', true), block('work'), block('table')])}
        week={week()}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByTestId('plan-today-minutes')).toHaveTextContent('10 of 30 min')
  })

  it('says the day is done, and that the stage still wants other days', () => {
    render(
      <TodayBlocks day={day([block('warmup', true), block('work', true)])} week={week()} onOpen={vi.fn()} />,
    )
    const done = screen.getByTestId('plan-today-complete')
    expect(done).toHaveTextContent('Today’s session is done.')
    expect(done).toHaveTextContent('other days')
    expect(screen.queryByTestId('plan-today-start')).toBeNull()
  })

  it('lets a finished day be opened again, row by row', () => {
    const onOpen = vi.fn()
    render(
      <TodayBlocks day={day([block('warmup', true), block('work', true)])} week={week()} onOpen={onOpen} />,
    )
    fireEvent.click(screen.getByTestId('plan-block-work'))
    expect(onOpen).toHaveBeenCalledExactlyOnceWith('speedDrill', expect.objectContaining({ mode: 'speedDrill' }))
  })

  it('says so when there is nothing to drill, and claims neither a start nor a finish', () => {
    render(<TodayBlocks day={day([])} week={week()} onOpen={vi.fn()} />)
    expect(screen.getByTestId('plan-today')).toHaveTextContent('Nothing to drill yet')
    expect(screen.queryAllByTestId(/^plan-block-/)).toEqual([])
    expect(screen.queryByTestId('plan-today-start')).toBeNull()
    expect(screen.queryByTestId('plan-today-complete')).toBeNull()
  })

  it('shows the week beside the day: days trained of days planned', () => {
    render(<TodayBlocks day={day([block('work')])} week={week({ trained: 2, target: 4 })} onOpen={vi.fn()} />)
    const today = screen.getByTestId('plan-today')
    expect(within(today).getByText('2 of 4 days')).toBeInTheDocument()
    expect(within(today).getByTestId('plan-week')).toBeInTheDocument()
    expect(within(today).queryByText('Week done')).toBeNull()
  })

  it('says the week is done once the planned days are in', () => {
    render(
      <TodayBlocks day={day([block('work')])} week={week({ trained: 3, target: 3, met: true })} onOpen={vi.fn()} />,
    )
    expect(within(screen.getByTestId('plan-today')).getByText('Week done')).toBeInTheDocument()
  })
})

// ── PathStrip ────────────────────────────────────────────────────────

describe('PathStrip', () => {
  const progress = (isPro = true) => deriveCurriculum([], [], isPro)
  const stateOf = (id: StageId) => screen.getByTestId(`path-node-${id}`).getAttribute('data-state')

  it('draws every stage of the road, in order, by name', () => {
    render(<PathStrip progress={progress()} activeId="rules" entryIndex={0} goalIndex={6} onOpen={vi.fn()} />)
    const nodes = within(screen.getByTestId('plan-path')).getAllByTestId(/^path-node-/)
    expect(nodes.map(n => n.getAttribute('data-testid'))).toEqual(CURRICULUM.map(s => `path-node-${s.id}`))
    expect(nodes[0]).toHaveTextContent('The game itself')
    expect(nodes[2]).toHaveTextContent('The Hi-Lo count')
  })

  it('marks what lies behind the placement as known, the stage on turn as active, the rest as ahead', () => {
    render(<PathStrip progress={progress()} activeId="hi-lo" entryIndex={2} goalIndex={6} onOpen={vi.fn()} />)
    expect(CURRICULUM.map(s => stateOf(s.id)))
      .toEqual(['done', 'done', 'active', 'ahead', 'ahead', 'ahead', 'ahead'])
  })

  it('draws a stage finished ahead of the road as done already, not as part of the road walked', () => {
    // 18 Nov 2026: "table" ticked like the stages behind while "bet spread"
    // before it was still open read as a road with a gap in it.
    const paid = deriveCurriculum([], ['rules'], true, ['hi-lo'])
    render(<PathStrip progress={paid} activeId="basic-strategy" entryIndex={0} goalIndex={6} onOpen={vi.fn()} />)
    expect(stateOf('rules')).toBe('done')
    expect(stateOf('basic-strategy')).toBe('active')
    expect(stateOf('hi-lo')).toBe('early')
  })

  it('ticks it like the rest once the road has reached it', () => {
    const paid = deriveCurriculum([], ['rules'], true, ['basic-strategy', 'hi-lo'])
    render(<PathStrip progress={paid} activeId="true-count" entryIndex={0} goalIndex={6} onOpen={vi.fn()} />)
    expect(stateOf('hi-lo')).toBe('done')
  })

  it('has no active point once the goal is reached', () => {
    render(<PathStrip progress={progress()} activeId={null} entryIndex={7} goalIndex={6} onOpen={vi.fn()} />)
    expect(CURRICULUM.some(s => stateOf(s.id) === 'active')).toBe(false)
  })

  it('shows sessions and days on the active point only', () => {
    const drill = CURRICULUM.find(s => s.id === 'hi-lo')!.drill!
    render(<PathStrip progress={progress()} activeId="hi-lo" entryIndex={2} goalIndex={6} onOpen={vi.fn()} />)
    expect(screen.getByTestId('path-node-hi-lo'))
      .toHaveTextContent(`0/${drill.minSessions} · 0/${drill.minDays} days`)
    expect(screen.getByTestId('path-node-true-count').textContent).not.toMatch(/days/)
  })

  it('shows no session count on a reading stage, which has none', () => {
    render(<PathStrip progress={progress()} activeId="rules" entryIndex={0} goalIndex={6} onOpen={vi.fn()} />)
    expect(screen.getByTestId('path-node-rules').textContent).not.toMatch(/\d\/\d/)
  })

  it('draws the stages beyond the goal faint, and none of the others', () => {
    // "Curious" ends at the true count, index 3.
    render(<PathStrip progress={progress()} activeId="hi-lo" entryIndex={2} goalIndex={3} onOpen={vi.fn()} />)
    const faint = CURRICULUM.filter(s => screen.getByTestId(`path-node-${s.id}`).className.includes('opacity-40'))
    expect(faint.map(s => s.id)).toEqual(['deviations', 'bet-spread', 'table'])
  })

  it('numbers the open stages by their place on the road', () => {
    render(<PathStrip progress={progress()} activeId="hi-lo" entryIndex={2} goalIndex={6} onOpen={vi.fn()} />)
    expect(screen.getByTestId('path-node-hi-lo')).toHaveTextContent(/^3/)
    expect(screen.getByTestId('path-node-true-count')).toHaveTextContent(/^4/)
  })

  it('shows a lock, not a number, on a stage a free learner cannot open', () => {
    render(<PathStrip progress={progress(false)} activeId="hi-lo" entryIndex={2} goalIndex={6} onOpen={vi.fn()} />)
    // True count is the fourth stage and Pro; deviations, the fifth, is free.
    expect(screen.getByTestId('path-node-true-count').textContent).not.toMatch(/^4/)
    expect(screen.getByTestId('path-node-deviations')).toHaveTextContent(/^5/)
  })

  it('opens the full plan', () => {
    const onOpen = vi.fn()
    render(<PathStrip progress={progress()} activeId="hi-lo" entryIndex={2} goalIndex={6} onOpen={onOpen} />)
    const open = screen.getByTestId('plan-path-open')
    expect(open).toHaveTextContent('Open the full plan')
    fireEvent.click(open)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})

// ── HowItWorks ───────────────────────────────────────────────────────

describe('HowItWorks', () => {
  it('explains the plan in three numbered sentences', () => {
    render(<HowItWorks onDismiss={vi.fn()} />)
    const card = screen.getByTestId('how-it-works')
    expect(within(card).getByRole('heading', { name: 'How this works' })).toBeInTheDocument()
    expect(within(card).getAllByRole('listitem')).toHaveLength(3)
    // The rule that surprises people is in there in so many words.
    expect(card).toHaveTextContent('Nobody finishes one in a single sitting.')
  })

  it('is dismissed by the corner button and by "Got it" alike', () => {
    const onDismiss = vi.fn()
    render(<HowItWorks onDismiss={onDismiss} />)
    fireEvent.click(screen.getByTestId('how-it-works-dismiss'))
    fireEvent.click(screen.getByText('Got it'))
    expect(onDismiss).toHaveBeenCalledTimes(2)
  })

  it('gives the corner button a name', () => {
    render(<HowItWorks onDismiss={vi.fn()} />)
    expect(screen.getByTestId('how-it-works-dismiss')).toHaveAccessibleName('Got it')
  })

  it('offers the tour where there is one, without dismissing by itself', () => {
    const onDismiss = vi.fn()
    const onTour = vi.fn()
    render(<HowItWorks onDismiss={onDismiss} onTour={onTour} />)
    fireEvent.click(screen.getByTestId('how-it-works-tour'))
    expect(onTour).toHaveBeenCalledTimes(1)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('offers no tour where there is none', () => {
    render(<HowItWorks onDismiss={vi.fn()} />)
    expect(screen.queryByTestId('how-it-works-tour')).toBeNull()
  })
})
