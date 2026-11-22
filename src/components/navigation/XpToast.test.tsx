import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { XpToast } from './XpToast'
import { useLevelStore } from '../../store/level-store'
import { LEVELS } from '../../services/level-system'

/**
 * The half of the XP system the player can actually perceive.
 *
 * Session XP was always credited correctly and always invisibly — paid out on
 * unmount, during navigation, in a component being destroyed. Achievements and
 * challenges announced themselves as they landed, so those felt alive and
 * training felt broken. These tests pin the announcement.
 */
const award = (amount: number, labelKey = 'xp.source.session', id = 1) =>
  useLevelStore.setState({
    lastAward: { amount, labelKey, id, parts: amount > 0 ? [{ labelKey, amount }] : [], at: Date.now() },
    showLevelUp: false,
  })

/** An award made of several parts: no single label, the total and a list. */
const awardOf = (parts: { labelKey: string; amount: number; labelParams?: Record<string, string> }[], noteKey?: string) =>
  useLevelStore.setState({
    lastAward: { amount: parts.reduce((n, p) => n + p.amount, 0), parts, noteKey, id: 7, at: Date.now() },
    showLevelUp: false,
  })

beforeEach(() => {
  useLevelStore.setState({ lastAward: null, showLevelUp: false, levelUpData: null })
})
afterEach(() => vi.useRealTimers())

describe('XpToast', () => {
  it('says nothing when no XP has been paid', () => {
    render(<XpToast />)
    expect(screen.queryByTestId('xp-toast')).toBeNull()
  })

  it('announces the amount and where it came from', () => {
    award(40)
    render(<XpToast />)
    const toast = screen.getByTestId('xp-toast')
    expect(toast.textContent).toContain('40')
    expect(toast.textContent).toContain('Training session')
  })

  it('translates the source instead of printing the key', () => {
    award(40)
    render(<XpToast />)
    expect(screen.getByTestId('xp-toast').textContent).not.toContain('xp.source')
  })

  it('stays quiet while the level-up popup is open', () => {
    // The popup already lists every source of the climb, this one included. A
    // toast underneath would repeat it and fight for the same moment.
    award(40)
    useLevelStore.setState({
      showLevelUp: true,
      levelUpData: {
        oldLevel: LEVELS[0], newLevel: LEVELS[1],
        breakdown: [{ labelKey: 'xp.source.session', amount: 40 }],
      },
    })
    render(<XpToast />)
    expect(screen.queryByTestId('xp-toast')).toBeNull()
  })

  it('clears itself so it does not sit on screen forever', () => {
    vi.useFakeTimers()
    award(40)
    render(<XpToast />)
    expect(screen.getByTestId('xp-toast')).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(3000) })
    expect(useLevelStore.getState().lastAward).toBeNull()
  })

  it('is polite, not assertive — a reward must not interrupt a screen reader', () => {
    award(40)
    render(<XpToast />)
    expect(screen.getByTestId('xp-toast')).toHaveAttribute('aria-live', 'polite')
  })

  it('announces a second identical payout', () => {
    // The case a regular user hits most: two 40-XP drills in a row. Keying the
    // entrance on the amount instead of the id would swallow the second.
    vi.useFakeTimers()
    award(40, 'xp.source.session', 1)
    const { rerender } = render(<XpToast />)
    expect(screen.getByTestId('xp-toast')).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(3000) })
    rerender(<XpToast />)
    expect(screen.queryByTestId('xp-toast')).toBeNull()

    act(() => award(40, 'xp.source.session', 2))
    rerender(<XpToast />)
    expect(screen.getByTestId('xp-toast')).toBeInTheDocument()
  })

  /**
   * What the XP was for (21 Nov 2026). One line could only name one source;
   * a session with an accuracy bonus that finished a stage named the last of
   * the three and paid the other two in silence.
   */
  describe('several parts', () => {
    const lines = () => screen.getAllByTestId('xp-toast-line').map(li => li.textContent)

    it('a single part stays a single line, with no list', () => {
      award(40)
      render(<XpToast />)
      expect(screen.queryByTestId('xp-toast-line')).toBeNull()
      expect(screen.queryByTestId('xp-toast-total')).toBeNull()
      expect(screen.getByTestId('xp-toast').textContent).toContain('Training session')
    })

    it('shows the total and each part with its amount', () => {
      awardOf([
        { labelKey: 'xp.part.correct', amount: 40 },
        { labelKey: 'xp.part.accuracy', amount: 10 },
        { labelKey: 'xp.part.personalBest', amount: 50 },
      ])
      render(<XpToast />)
      expect(screen.getByTestId('xp-toast-total').textContent).toContain('100')
      expect(lines()).toEqual(['Correct answers+40', 'Accuracy bonus+10', 'New personal best+50'])
    })

    it('never lists more than three lines, and they add up to the total', () => {
      awardOf([
        { labelKey: 'xp.part.correct', amount: 40 },
        { labelKey: 'xp.part.accuracy', amount: 20 },
        { labelKey: 'plan.stageComplete', amount: 250, labelParams: { stage: 'Hi-Lo' } },
        { labelKey: 'xp.source.weekGoal', amount: 60 },
        { labelKey: 'xp.source.weekStreak', amount: 50, labelParams: { n: '2' } },
        { labelKey: 'xp.source.achievements', amount: 25 },
      ], 'xp.part.dailyCap')
      render(<XpToast />)
      const shown = screen.getAllByTestId('xp-toast-line')
      expect(shown).toHaveLength(3)
      const amounts = shown.map(li => Number(/\+(\d+)$/.exec(li.textContent ?? '')?.[1] ?? 0))
      expect(amounts.reduce((a, b) => a + b, 0)).toBe(445)
      expect(screen.getByTestId('xp-toast-total').textContent).toContain('445')
      expect(lines()[0]).toBe('Stage complete: Hi-Lo+250')
      expect(lines()[2]).toBe('Other+135')
    })

    it('says that the day’s limit was reached, as a line without an amount', () => {
      awardOf([
        { labelKey: 'xp.part.correct', amount: 30 },
        { labelKey: 'plan.stageComplete', amount: 250, labelParams: { stage: 'Hi-Lo' } },
      ], 'xp.part.dailyCap')
      render(<XpToast />)
      expect(lines()).toEqual(['Correct answers+30', 'Stage complete: Hi-Lo+250', 'Daily limit reached'])
    })

    it('translates every line', () => {
      awardOf([
        { labelKey: 'xp.source.weekGoal', amount: 60 },
        { labelKey: 'xp.source.weekStreak', amount: 100, labelParams: { n: '4' } },
      ])
      render(<XpToast />)
      expect(lines()).toEqual(['Weekly goal reached+60', '4 weeks in a row+100'])
      expect(screen.getByTestId('xp-toast').textContent).not.toMatch(/xp\.(part|source)/)
    })

    it('still clears itself — a little later, there is more to read', () => {
      vi.useFakeTimers()
      awardOf([{ labelKey: 'xp.part.correct', amount: 40 }, { labelKey: 'xp.part.accuracy', amount: 10 }])
      render(<XpToast />)
      act(() => { vi.advanceTimersByTime(3000) })
      expect(useLevelStore.getState().lastAward).not.toBeNull()
      act(() => { vi.advanceTimersByTime(1500) })
      expect(useLevelStore.getState().lastAward).toBeNull()
    })

    it('stays polite and stays out of the level-up popup’s way', () => {
      awardOf([{ labelKey: 'xp.part.correct', amount: 40 }, { labelKey: 'xp.part.accuracy', amount: 10 }])
      const { rerender } = render(<XpToast />)
      expect(screen.getByTestId('xp-toast')).toHaveAttribute('aria-live', 'polite')
      act(() => useLevelStore.setState({
        showLevelUp: true,
        levelUpData: { oldLevel: LEVELS[0], newLevel: LEVELS[1], breakdown: [] },
      }))
      rerender(<XpToast />)
      expect(screen.queryByTestId('xp-toast')).toBeNull()
    })
  })
})
