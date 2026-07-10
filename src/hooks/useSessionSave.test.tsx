import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { useEffect } from 'react'
import { useSessionSave } from './useSessionSave'
import { useStatsStore } from '../store/stats-store'
import type { SessionDetails } from '../services/stats-types'

const details = (): SessionDetails => ({
  type: 'speedDrill', cardsPerRound: 20, speedMs: 1000, rcErrors: [],
})

/** Test harness: mounts the hook and seeds its stats ref (in an effect, as the
 * real mode components do from their answer handlers — never during render). */
function Harness({ questions }: { questions: number }) {
  const { statsRef } = useSessionSave('speedDrill', details)
  useEffect(() => {
    statsRef.current = { totalQuestions: questions, correctAnswers: questions, bestStreak: 0 }
  }, [questions, statsRef])
  return null
}

describe('useSessionSave', () => {
  let recordSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    recordSpy = vi.spyOn(useStatsStore.getState(), 'recordSession').mockResolvedValue()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('saves the session on unmount (in-app navigation)', () => {
    const { unmount } = render(<Harness questions={20} />)
    unmount()
    expect(recordSpy).toHaveBeenCalledTimes(1)
    expect(recordSpy.mock.calls[0][0]).toMatchObject({ mode: 'speedDrill', totalQuestions: 20 })
  })

  it('does not save a too-short session', () => {
    const { unmount } = render(<Harness questions={2} />)
    unmount()
    expect(recordSpy).not.toHaveBeenCalled()
  })

  it('saves on pagehide (tab close / reload)', () => {
    render(<Harness questions={20} />)
    window.dispatchEvent(new Event('pagehide'))
    expect(recordSpy).toHaveBeenCalledTimes(1)
  })

  it('records only once when pagehide is followed by unmount', () => {
    const { unmount } = render(<Harness questions={20} />)
    window.dispatchEvent(new Event('pagehide'))
    unmount()
    expect(recordSpy).toHaveBeenCalledTimes(1)
  })
})
