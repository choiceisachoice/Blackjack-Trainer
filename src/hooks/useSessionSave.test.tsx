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

  /**
   * A second round inside one visit is the case the guard used to swallow.
   * Every summary screen offers "play again", and it restarts the mode without
   * unmounting it — so `finish()` met a guard that had never been re-opened and
   * the round was dropped with no error anywhere.
   */
  it('records a second round started with begin() in the same visit', () => {
    function TwoRounds() {
      const { statsRef, finish, begin } = useSessionSave('speedDrill', details)
      useEffect(() => {
        statsRef.current = { totalQuestions: 20, correctAnswers: 18, bestStreak: 4 }
        finish()
        begin()
        statsRef.current = { totalQuestions: 12, correctAnswers: 11, bestStreak: 6 }
        finish()
      }, [statsRef, finish, begin])
      return null
    }
    render(<TwoRounds />)
    expect(recordSpy).toHaveBeenCalledTimes(2)
    expect(recordSpy.mock.calls[0][0]).toMatchObject({ totalQuestions: 20 })
    expect(recordSpy.mock.calls[1][0]).toMatchObject({ totalQuestions: 12 })
  })

  /** begin() re-opens the guard; it must not weaken the double-save guard for
   *  a round that has already been recorded and not restarted. */
  it('still records only once when finish() is called twice without begin()', () => {
    function TwiceFinished() {
      const { statsRef, finish } = useSessionSave('speedDrill', details)
      useEffect(() => {
        statsRef.current = { totalQuestions: 20, correctAnswers: 18, bestStreak: 4 }
        finish()
        finish()
      }, [statsRef, finish])
      return null
    }
    const { unmount } = render(<TwiceFinished />)
    unmount()
    expect(recordSpy).toHaveBeenCalledTimes(1)
  })
})
