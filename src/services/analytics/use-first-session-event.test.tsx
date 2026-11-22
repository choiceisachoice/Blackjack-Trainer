import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { SpeedDrillDetails, TrainingSessionResult } from '../stats-types'
import { CountingSystemId } from '../../engine/counting/types'

const trackEvent = vi.fn<(name: string) => Promise<void>>()
vi.mock('./events', () => ({ trackEvent: (name: string) => trackEvent(name) }))

import { useStatsStore } from '../../store/stats-store'
import { isFirstSessionRecorded, useFirstSessionEvent, watchFirstSession, FRESH_SESSION_MS } from './use-first-session-event'

const NOW = Date.parse('2026-11-21T12:00:00Z')
const DETAILS: SpeedDrillDetails = { type: 'speedDrill', cardsPerRound: 10, speedMs: 1000, rcErrors: [0] }
const SYSTEM = CountingSystemId.HiLo

function session(id: string, startedAt: number = NOW - 5 * 60_000): TrainingSessionResult {
  return {
    id,
    mode: 'speedDrill',
    timestamp: new Date(startedAt).toISOString(),
    countingSystem: SYSTEM,
    durationSeconds: 120,
    totalQuestions: 10,
    correctAnswers: 9,
    accuracy: 0.9,
    bestStreak: 5,
    details: DETAILS,
  } satisfies TrainingSessionResult
}

/** What `recordSession` does to the list: prepend, and touch nothing else. */
function record(s: TrainingSessionResult) {
  useStatsStore.setState(prev => ({ sessions: [s, ...prev.sessions] }))
}

/** What `loadStats` does: raise the flag, then set the list and drop it. */
function load(sessions: TrainingSessionResult[]) {
  useStatsStore.setState({ isLoading: true })
  useStatsStore.setState({ sessions, isLoading: false })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  trackEvent.mockReset()
  trackEvent.mockResolvedValue()
  useStatsStore.setState({ sessions: [], lifetimeStats: null, isLoading: false })
})

/** Watchers started by a test, stopped after it whatever happened in it. */
const watchers: (() => void)[] = []
function watch(): () => void {
  const stop = watchFirstSession()
  watchers.push(stop)
  return stop
}

afterEach(() => {
  while (watchers.length) watchers.pop()!()
  vi.useRealTimers()
})

describe('isFirstSessionRecorded', () => {
  const none = { sessions: [], isLoading: false }
  const one = { sessions: [session('a')], isLoading: false }

  it('is true for none → one, recorded just now', () => {
    expect(isFirstSessionRecorded(none, one, NOW)).toBe(true)
  })

  it('is false for any other step', () => {
    const two = { sessions: [session('b'), session('a')], isLoading: false }
    expect(isFirstSessionRecorded(one, two, NOW)).toBe(false)
    expect(isFirstSessionRecorded(none, two, NOW)).toBe(false)
    expect(isFirstSessionRecorded(none, none, NOW)).toBe(false)
    expect(isFirstSessionRecorded(one, none, NOW)).toBe(false)
    expect(isFirstSessionRecorded(one, one, NOW)).toBe(false)
  })

  it('is false when the list was loaded rather than recorded', () => {
    expect(isFirstSessionRecorded({ ...none, isLoading: true }, one, NOW)).toBe(false)
    expect(isFirstSessionRecorded(none, { ...one, isLoading: true }, NOW)).toBe(false)
  })

  it('is false for a single old session, however it arrived', () => {
    const old = { sessions: [session('a', NOW - FRESH_SESSION_MS - 1000)], isLoading: false }
    expect(isFirstSessionRecorded(none, old, NOW)).toBe(false)
    const lastWeek = { sessions: [session('a', NOW - 7 * 86_400_000)], isLoading: false }
    expect(isFirstSessionRecorded(none, lastWeek, NOW)).toBe(false)
  })

  it('is false for a session with an unreadable time', () => {
    const broken = { sessions: [{ ...session('a'), timestamp: 'not a date' }], isLoading: false }
    expect(isFirstSessionRecorded(none, broken, NOW)).toBe(false)
  })
})

describe('watchFirstSession', () => {
  it('fires once when the first session is recorded', () => {
    const stop = watch()
    record(session('a'))
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith('first_session')
    stop()
  })

  it('does not fire for the second, third or tenth session', () => {
    const stop = watch()
    record(session('a'))
    for (let i = 0; i < 9; i++) record(session(`more-${i}`))
    expect(trackEvent).toHaveBeenCalledTimes(1)
    stop()
  })

  it('does not fire when history is loaded — one session or many', () => {
    const stop = watch()
    load([session('a')])
    load([])
    load([session('c'), session('b'), session('a')])
    expect(trackEvent).not.toHaveBeenCalled()
    stop()
  })

  it('does not fire for a session recorded on top of loaded history', () => {
    const stop = watch()
    load([session('b'), session('a')])
    record(session('c'))
    expect(trackEvent).not.toHaveBeenCalled()
    stop()
  })

  it('does not fire for updates that leave the list alone', () => {
    const stop = watch()
    useStatsStore.setState({ isLoading: true })
    useStatsStore.setState({ isLoading: false })
    useStatsStore.setState({ lifetimeStats: null })
    expect(trackEvent).not.toHaveBeenCalled()
    stop()
  })

  it('fires through the store’s own recordSession', async () => {
    const stop = watch()
    await useStatsStore.getState().recordSession({
      mode: 'speedDrill', startTime: NOW - 60_000, totalQuestions: 10, correctAnswers: 9, bestStreak: 4,
      countingSystem: SYSTEM, endTime: NOW, details: DETAILS,
    })
    await useStatsStore.getState().recordSession({
      mode: 'speedDrill', startTime: NOW - 30_000, totalQuestions: 10, correctAnswers: 9, bestStreak: 4,
      countingSystem: SYSTEM, endTime: NOW, details: DETAILS,
    })
    expect(useStatsStore.getState().sessions).toHaveLength(2)
    expect(trackEvent).toHaveBeenCalledTimes(1)
    stop()
  })

  it('stops when told to', () => {
    const stop = watch()
    stop()
    record(session('a'))
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('does not let a failing tracker break the store update', () => {
    trackEvent.mockImplementation(() => { throw new Error('boom') })
    const stop = watch()
    expect(() => record(session('a'))).not.toThrow()
    expect(useStatsStore.getState().sessions).toHaveLength(1)
    stop()
  })
})

describe('useFirstSessionEvent', () => {
  it('watches only while signed in', () => {
    const { rerender, unmount } = renderHook(({ signedIn }) => useFirstSessionEvent(signedIn), { initialProps: { signedIn: false } })
    record(session('a'))
    expect(trackEvent).not.toHaveBeenCalled()

    useStatsStore.setState({ sessions: [] })
    rerender({ signedIn: true })
    record(session('b'))
    expect(trackEvent).toHaveBeenCalledTimes(1)

    // Signed out again (the stats are wiped), then someone trains signed out.
    rerender({ signedIn: false })
    useStatsStore.setState({ sessions: [] })
    record(session('c'))
    expect(trackEvent).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('fires once, not once per render or per mounted copy’s re-render', () => {
    const { rerender, unmount } = renderHook(() => useFirstSessionEvent(true))
    rerender()
    rerender()
    record(session('a'))
    expect(trackEvent).toHaveBeenCalledTimes(1)
    unmount()
    useStatsStore.setState({ sessions: [] })
    record(session('b'))
    expect(trackEvent).toHaveBeenCalledTimes(1)
  })
})
