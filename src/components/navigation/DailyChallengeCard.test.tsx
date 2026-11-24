import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { DailyChallengeCard } from './DailyChallengeCard'
import { useChallengeStore } from '../../store/challenge-store'
import { CHALLENGE_POOL } from '../../services/challenges/challenge-pool'
import { CHALLENGE_XP, type ChallengeDefinition, type DailyChallengeState } from '../../services/challenges/challenge-types'

const byType = (type: ChallengeDefinition['type'], pred: (c: ChallengeDefinition) => boolean = () => true) =>
  CHALLENGE_POOL.find(c => c.type === type && pred(c))!

function seed(challenge: ChallengeDefinition, progress: number, completed = false, streak = 0) {
  const state: DailyChallengeState = {
    challengeId: challenge.id, date: '2026-11-24', progress, completed, completedAt: completed ? new Date().toISOString() : null,
  }
  // `refresh` is stubbed so the card's mount does not replace the seeded state.
  useChallengeStore.setState({ challenge, state, streak, justCompleted: false, refresh: vi.fn(), dismissCompletion: vi.fn() })
}

beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('DailyChallengeCard', () => {
  it('shows the task, its reward and how long it has left', () => {
    const c = byType('win_streak', x => x.target <= 10)
    seed(c, 0)
    render(<DailyChallengeCard />)
    const card = screen.getByTestId('daily-challenge-card')
    expect(card).toHaveTextContent('Daily Challenge')
    expect(card).toHaveTextContent(/remaining/)
    expect(within(card).getByTestId('challenge-reward')).toHaveTextContent(`+${CHALLENGE_XP[c.difficulty]} XP`)
  })

  it('draws a small tally as slots to fill, not an empty strip', () => {
    const c = byType('win_streak', x => x.target <= 10)
    seed(c, 2)
    render(<DailyChallengeCard />)
    const slots = screen.getByTestId('challenge-pips').querySelectorAll('[data-filled]')
    expect(slots).toHaveLength(c.target)
    expect(screen.getByTestId('daily-challenge-card')).toHaveTextContent(`2 / ${c.target} · ${c.target - 2} to go`)
  })

  it('says nothing about "to go" before the first unit — the slots already say it', () => {
    const c = byType('win_streak', x => x.target <= 10)
    seed(c, 0)
    render(<DailyChallengeCard />)
    expect(screen.getByTestId('daily-challenge-card')).not.toHaveTextContent('to go')
  })

  it('uses a bar for a large tally', () => {
    const c = byType('play_hands', x => x.target > 10)
    seed(c, Math.round(c.target / 4))
    render(<DailyChallengeCard />)
    expect(screen.queryByTestId('challenge-pips')).toBeNull()
    expect(screen.getByTestId('progress-bar')).toBeInTheDocument()
  })

  it('turns green and says when the next one comes once complete', () => {
    const c = byType('win_streak', x => x.target <= 10)
    seed(c, c.target, true)
    render(<DailyChallengeCard />)
    const card = screen.getByTestId('daily-challenge-card')
    expect(card).toHaveTextContent('Complete')
    expect(card).toHaveTextContent('Come back tomorrow')
    expect(card).not.toHaveTextContent(/remaining/)
  })

  it('shows a running streak of completed days', () => {
    seed(byType('play_sessions'), 0, false, 3)
    render(<DailyChallengeCard />)
    expect(screen.getByTestId('streak-badge')).toHaveTextContent('3 day streak')
  })
})
