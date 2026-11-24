import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { RoundSummary, type SummaryMiss } from './RoundSummary'
import type { RoundCapture } from './round-capture'
import { useLevelStore } from '../../store/level-store'
import { useStatsStore } from '../../store/stats-store'
import { computeLifetimeStats } from '../../services/storage/storage-service'
import { LEVELS } from '../../services/level-system'
import { XpToast } from '../navigation/XpToast'
import { AchievementToast } from '../achievements/AchievementToast'
import { useAchievementStore } from '../../store/achievement-store'
import { ALL_ACHIEVEMENTS } from '../../services/achievements/achievement-list'
import type { TrainingSessionResult } from '../../services/stats-types'
import { CountingSystemId } from '../../types'

let seq = 0
function flash(correct: number, total: number, day: number): TrainingSessionResult {
  seq += 1
  return {
    id: `f${seq}`, mode: 'deviationFlashCards', timestamp: new Date(Date.UTC(2026, 10, day, 12)).toISOString(),
    countingSystem: CountingSystemId.HiLo, durationSeconds: 120, totalQuestions: total, correctAnswers: correct,
    accuracy: correct / total, bestStreak: correct, details: { type: 'deviationFlashCards', deviationSet: 'all', perDeviation: {} },
  }
}

const MISSES: SummaryMiss[] = [
  { id: '1', spot: 'Hard 16 vs 10', tag: 'TC +1', chosen: 'Hit', right: 'Stand' },
  { id: '2', spot: 'Soft 18 vs 9', chosen: 'Stand', right: 'Hit' },
]

/** A round of 7/10 recorded after `earlier`, paid with `amount` XP. */
function setup(earlier: TrainingSessionResult[], amount = 14): RoundCapture {
  const round = flash(7, 10, 20)
  const sessions = [round, ...earlier]
  useStatsStore.setState({ sessions, lifetimeStats: computeLifetimeStats(sessions) })
  useLevelStore.setState({
    totalXP: LEVELS[11].xpRequired + 700,
    lastAward: { id: 9, amount, parts: [{ labelKey: 'xp.part.correct', amount }], labelKey: 'xp.source.session', at: Date.now() },
    awardInPlace: true,
    awardSeenId: 0,
    showLevelUp: false,
  })
  return { awardSince: 8, sessionIds: new Set(earlier.map(s => s.id)), stage: null, unlockedBefore: new Set(['first_hand']) }
}

function renderSummary(capture: RoundCapture | null, extra: Partial<Parameters<typeof RoundSummary>[0]> = {}) {
  const onAgain = vi.fn()
  const onBack = vi.fn()
  const view = render(
    <>
      <XpToast />
      <RoundSummary
        mode="deviationFlashCards"
        score={{ correct: 7, total: 10 }}
        capture={capture}
        trail={[true, false, true, true, true, false, true, true, false, true]}
        misses={MISSES}
        onAgain={onAgain}
        onBack={onBack}
        {...extra}
      />
    </>,
  )
  return { ...view, onAgain, onBack }
}

beforeEach(() => {
  localStorage.clear()
})

describe('RoundSummary', () => {
  it('shows the score, the verdict and how it stands against the best earlier round', () => {
    renderSummary(setup([flash(9, 10, 2), flash(8, 10, 3)]))
    expect(screen.getByTestId('summary-score')).toHaveTextContent('70%')
    expect(screen.getByTestId('summary-verdict')).toHaveTextContent('Solid')
    expect(screen.getByTestId('summary-best')).toHaveAttribute('data-best', 'below')
    expect(screen.getByTestId('summary-best')).toHaveTextContent('20 points short of your best')
    expect(screen.getByTestId('summary-best-bars')).toHaveTextContent('90%')
  })

  it('calls a first round a first round, with nothing to compare', () => {
    renderSummary(setup([]))
    expect(screen.getByTestId('summary-best')).toHaveAttribute('data-best', 'first')
    expect(screen.queryByTestId('summary-best-bars')).toBeNull()
  })

  it('shows this round’s XP in place, on the level bar, and the toast stays quiet', () => {
    renderSummary(setup([flash(9, 10, 2)]))
    expect(screen.getByTestId('summary-xp-amount')).toHaveTextContent('+14 XP')
    expect(screen.getByTestId('summary-to-next')).toHaveTextContent(`${(LEVELS[12].xpRequired - LEVELS[11].xpRequired - 700).toLocaleString('en')} XP to level 13`)
    const bar = screen.getByTestId('summary-level-bar')
    expect(Number(bar.getAttribute('data-to'))).toBeGreaterThan(Number(bar.getAttribute('data-from')))
    expect(screen.queryByTestId('xp-toast')).toBeNull()
  })

  it('does not claim an award from before the round', () => {
    const capture = setup([flash(9, 10, 2)])
    renderSummary({ ...capture, awardSince: 9 })
    expect(screen.getByTestId('summary-xp-amount')).toHaveTextContent('+0 XP')
    expect(screen.getByText('No XP this round — XP is paid for right answers.')).toBeInTheDocument()
  })

  it('hands the award back on the way out, as seen, so the toast does not replay it', () => {
    const { unmount } = render(<RoundSummary mode="deviationFlashCards" score={{ correct: 7, total: 10 }} capture={setup([])} misses={[]} onAgain={() => {}} onBack={() => {}} />)
    unmount()
    expect(useLevelStore.getState().awardInPlace).toBe(false)
    expect(useLevelStore.getState().awardSeenId).toBe(9)
    render(<XpToast />)
    expect(screen.queryByTestId('xp-toast')).toBeNull()
  })

  it('lists the misses with the play chosen and the right one', () => {
    renderSummary(setup([]))
    const rows = screen.getAllByTestId('summary-miss')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('Hard 16 vs 10')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Hit').tagName).toBe('S')
    expect(within(rows[0]).getByText('Stand')).toBeInTheDocument()
    expect(screen.getByText('2 misses · the right answers')).toBeInTheDocument()
  })

  it('says so when there was nothing to miss', () => {
    renderSummary(setup([]), { misses: [] })
    expect(screen.getByTestId('summary-no-misses')).toHaveTextContent('No misses')
  })

  it('offers "Drill these" only when the mode passes a drill', () => {
    renderSummary(setup([]))
    expect(screen.queryByTestId('drill-misses')).toBeNull()
  })

  it('wires Again, Back and the drill', () => {
    const onDrill = vi.fn()
    const { onAgain, onBack } = renderSummary(setup([]), { drill: { label: 'Drill these 2 hands', onDrill } })
    fireEvent.click(screen.getByTestId('summary-again'))
    fireEvent.click(screen.getByTestId('back-to-settings'))
    fireEvent.click(screen.getByTestId('drill-misses'))
    expect(onAgain).toHaveBeenCalledTimes(1)
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onDrill).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('summary-again')).toHaveTextContent('Again')
  })

  it('points at the plan stage the round worked on', () => {
    const capture = setup([flash(9, 10, 2)])
    // Basic strategy counts every flashcard round; 7/10 is under its 85 % mark.
    renderSummary({ ...capture, stage: 'basic-strategy' })
    expect(screen.getByTestId('summary-stage-count')).toHaveTextContent('1 of 8 rounds above the 85% mark')
    expect(screen.queryByTestId('summary-stage-round')).toBeNull()
    expect(screen.getByTestId('summary-stage-count')).toHaveTextContent('on 1 of 4 days')
  })
})

describe('RoundSummary — the awards the round unlocked', () => {
  const sharp = ALL_ACHIEVEMENTS.find(a => a.id === 'sharp_eye')!

  beforeEach(() => {
    useAchievementStore.setState({ unlockedIds: ['first_hand', 'sharp_eye'], newlyUnlocked: [sharp], unlocksInPlace: true })
  })

  it('names the awards unlocked since the round began — not the older ones — and the toast stays quiet', () => {
    render(
      <>
        <AchievementToast />
        <RoundSummary mode="deviationFlashCards" score={{ correct: 7, total: 10 }} capture={setup([])} misses={[]} onAgain={() => {}} onBack={() => {}} />
      </>,
    )
    const block = screen.getByTestId('summary-unlocked')
    expect(block).toHaveTextContent('1 award unlocked')
    expect(within(block).getByText('Sharp Eye')).toBeInTheDocument()
    // first_hand was unlocked before the round: not this round's news.
    expect(within(block).getAllByTestId('summary-unlocked-award')).toHaveLength(1)
    expect(screen.queryByTestId('achievement-toast')).toBeNull()
  })

  it('takes them out of the toast queue on the way out, so they are not announced again', () => {
    const { unmount } = render(
      <RoundSummary mode="deviationFlashCards" score={{ correct: 7, total: 10 }} capture={setup([])} misses={[]} onAgain={() => {}} onBack={() => {}} />,
    )
    unmount()
    expect(useAchievementStore.getState().unlocksInPlace).toBe(false)
    expect(useAchievementStore.getState().newlyUnlocked).toEqual([])
  })

  it('shows no block when nothing was unlocked', () => {
    useAchievementStore.setState({ unlockedIds: ['first_hand'], newlyUnlocked: [] })
    render(<RoundSummary mode="deviationFlashCards" score={{ correct: 7, total: 10 }} capture={setup([])} misses={[]} onAgain={() => {}} onBack={() => {}} />)
    expect(screen.queryByTestId('summary-unlocked')).toBeNull()
  })
})

/**
 * The plan stage and the next award sit under a short list of misses; with a
 * long one they move to the middle panel, so no panel runs under the buttons.
 */
describe('RoundSummary — where the plan and the next award go', () => {
  const many: SummaryMiss[] = Array.from({ length: 4 }, (_, i) => ({ id: String(i), spot: `Spot ${i}`, right: 'Hit' }))

  it('under the misses when there are three or fewer', () => {
    renderSummary({ ...setup([flash(9, 10, 2)]), stage: 'basic-strategy' })
    const progress = screen.getByTestId('summary-progress')
    expect(progress.closest('section')).toContainElement(screen.getByTestId('flash-misses'))
  })

  it('in the middle panel when there are more', () => {
    renderSummary({ ...setup([flash(9, 10, 2)]), stage: 'basic-strategy' }, { misses: many })
    const progress = screen.getByTestId('summary-progress')
    expect(progress.closest('section')).toContainElement(screen.getByTestId('summary-xp'))
  })
})
