import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { useEffect } from 'react'
import { useSessionSave } from './useSessionSave'
import { useStatsStore } from '../store/stats-store'
import type { SessionDetails } from '../services/stats-types'
import { setLocalOwner } from '../services/storage/local-owner'
import { runBeforeSignOut } from '../services/storage/before-sign-out'

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
   * A sign-out wipes the device and only then unmounts the mode. The session
   * has to be written before the wipe, while the account is signed in — and
   * not after it, into storage the next account to sign in would inherit.
   */
  describe('around a sign-out', () => {
    afterEach(() => localStorage.clear())

    it('records the drill when the sign-out runs its tasks, and not again on unmount', async () => {
      setLocalOwner('user-a')
      const { unmount } = render(<Harness questions={20} />)
      await runBeforeSignOut()
      expect(recordSpy).toHaveBeenCalledTimes(1)
      localStorage.clear() // the wipe
      unmount()
      expect(recordSpy).toHaveBeenCalledTimes(1)
    })

    it('does not record on unmount once the device no longer belongs to the account', () => {
      setLocalOwner('user-a')
      const { unmount } = render(<Harness questions={20} />)
      localStorage.clear() // wiped without the tasks having run
      unmount()
      expect(recordSpy).not.toHaveBeenCalled()
    })

    it('keeps a session begun on a device nobody owned yet', () => {
      const { unmount } = render(<Harness questions={20} />)
      setLocalOwner('user-a') // the first sign-in settled meanwhile
      unmount()
      expect(recordSpy).toHaveBeenCalledTimes(1)
    })

    it('leaves no task behind after unmount', async () => {
      const { unmount } = render(<Harness questions={2} />)
      unmount()
      render(<Harness questions={20} />)
      await runBeforeSignOut()
      expect(recordSpy).toHaveBeenCalledTimes(1)
    })
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

  /**
   * The replay that recorded a session twice. The modes only write the stats
   * when an answer is given, so Start followed by leaving re-armed the guard
   * over the previous session's figures.
   */
  it('does not record the previous session again when a new one is started and left unanswered', () => {
    function FinishedThenRestarted() {
      const { statsRef, finish, begin } = useSessionSave('speedDrill', details)
      useEffect(() => {
        statsRef.current = { totalQuestions: 20, correctAnswers: 20, bestStreak: 20 }
        finish()
        begin() // "Start" on the settings screen — and then no answer at all
      }, [statsRef, finish, begin])
      return null
    }
    const { unmount } = render(<FinishedThenRestarted />)
    unmount()
    expect(recordSpy).toHaveBeenCalledTimes(1)
  })

  it('measures a sitting of several rounds from its first round, not its last', () => {
    // The Speed Drill calls begin() for every shoe. Restamping each time
    // recorded a ten-minute sitting as its final seconds.
    const clock = vi.spyOn(Date, 'now')
    function ThreeShoes() {
      const { statsRef, finish, begin } = useSessionSave('speedDrill', details)
      useEffect(() => {
        clock.mockReturnValue(1_000_000)
        begin()
        statsRef.current = { totalQuestions: 1, correctAnswers: 1, bestStreak: 1 }
        clock.mockReturnValue(1_300_000)
        begin() // try again
        statsRef.current = { totalQuestions: 3, correctAnswers: 3, bestStreak: 3 }
        clock.mockReturnValue(1_600_000)
        finish()
      }, [statsRef, finish, begin])
      return null
    }
    render(<ThreeShoes />)
    expect(recordSpy.mock.calls[0][0]).toMatchObject({ startTime: 1_000_000, totalQuestions: 3 })
  })

  it('starts the clock again for the session after a recorded one', () => {
    const clock = vi.spyOn(Date, 'now')
    function TwoSittings() {
      const { statsRef, finish, begin } = useSessionSave('speedDrill', details)
      useEffect(() => {
        clock.mockReturnValue(1_000_000)
        begin()
        statsRef.current = { totalQuestions: 5, correctAnswers: 5, bestStreak: 5 }
        finish()
        clock.mockReturnValue(2_000_000)
        begin()
        statsRef.current = { totalQuestions: 4, correctAnswers: 4, bestStreak: 4 }
        finish()
      }, [statsRef, finish, begin])
      return null
    }
    render(<TwoSittings />)
    expect(recordSpy.mock.calls[1][0]).toMatchObject({ startTime: 2_000_000, totalQuestions: 4 })
  })
})
