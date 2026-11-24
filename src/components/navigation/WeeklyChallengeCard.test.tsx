import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { WeeklyChallengeCard } from './WeeklyChallengeCard'
import { useWeeklyChallengeStore } from '../../store/weekly-challenge-store'
import { WEEKLY_CHALLENGE_POOL } from '../../services/challenges/weekly-challenge-pool'
import type { WeeklyChallengeDefinition, WeeklyChallengeState } from '../../services/challenges/challenge-types'

const pick = (pred: (c: WeeklyChallengeDefinition) => boolean) => WEEKLY_CHALLENGE_POOL.find(pred)!

function seed(challenge: WeeklyChallengeDefinition, progress: number, completed = false, streak = 0) {
  const state: WeeklyChallengeState = {
    challengeId: challenge.id, weekId: '2026-11-23', progress, completed, completedAt: completed ? new Date().toISOString() : null,
  }
  // `refresh` is stubbed so the card's mount does not replace the seeded state.
  useWeeklyChallengeStore.setState({ challenge, state, streak, justCompleted: false, refresh: vi.fn(), dismissCompletion: vi.fn() })
}

beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('WeeklyChallengeCard', () => {
  it('shows the task, its reward and how long the week has left', () => {
    const c = pick(x => x.target > 10)
    seed(c, 0)
    render(<WeeklyChallengeCard />)
    const card = screen.getByTestId('weekly-challenge-card')
    expect(card).toHaveTextContent('Weekly Challenge')
    expect(card).toHaveTextContent(/remaining/)
    expect(within(card).getByTestId('challenge-reward')).toHaveTextContent(`+${c.xpReward} XP`)
  })

  it('says how many are left once the tally has started', () => {
    const c = pick(x => x.type === 'play_hands' && x.target > 10)
    seed(c, 40)
    render(<WeeklyChallengeCard />)
    expect(screen.getByTestId('weekly-challenge-card')).toHaveTextContent(`40 / ${c.target} · ${c.target - 40} to go`)
    expect(screen.getByTestId('progress-bar')).toBeInTheDocument()
  })

  it('draws a small weekly tally as slots', () => {
    const c = pick(x => x.target <= 10 && !['earn_profit'].includes(x.type))
    seed(c, 1)
    render(<WeeklyChallengeCard />)
    expect(screen.getByTestId('challenge-pips').querySelectorAll('[data-filled]')).toHaveLength(c.target)
  })

  it('turns green and names next Monday once complete', () => {
    const c = pick(x => x.target > 10)
    seed(c, c.target, true)
    render(<WeeklyChallengeCard />)
    const card = screen.getByTestId('weekly-challenge-card')
    expect(card).toHaveTextContent('Complete')
    expect(card).toHaveTextContent('New challenge next Monday')
  })

  it('shows a running streak of completed weeks', () => {
    seed(pick(() => true), 0, false, 2)
    render(<WeeklyChallengeCard />)
    expect(screen.getByTestId('weekly-streak-badge')).toHaveTextContent('2 week streak')
  })
})
