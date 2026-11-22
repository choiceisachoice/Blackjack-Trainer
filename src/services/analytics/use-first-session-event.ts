import { useEffect } from 'react'
import { useStatsStore } from '../../store/stats-store'
import type { TrainingSessionResult } from '../stats-types'
import { trackEvent } from './events'

/**
 * `first_session`: the moment an account records its very first training
 * session.
 *
 * Derived from the stats store rather than written into it: the store's
 * session list going from none to one. Two things move that list — a session
 * being recorded, and the list being loaded (from the device or the account)
 * — and only the first is the event. They are told apart by what the store
 * itself shows:
 *
 * - `loadStats` raises `isLoading` and drops it in the same update that sets
 *   the list. A recorded session never touches the flag.
 * - A recorded session began moments ago. A list of one that arrives from the
 *   account with a session from last week is history, not news.
 *
 * What is left over is caught by the server: `analytics_event` stores
 * `first_session` once per account, ever, so a reset of the statistics or a
 * second device cannot count the same account twice.
 *
 * One limit, stated: an account that trained before this existed, whose list
 * fails to load (offline) and who then trains, is counted as a first session
 * on that day. It needs all three at once.
 */

/** A session that started longer ago than this was not recorded just now. */
export const FRESH_SESSION_MS = 12 * 60 * 60 * 1000

/** The part of the stats store this reads. */
export interface SessionListState {
  sessions: readonly TrainingSessionResult[]
  isLoading: boolean
}

/**
 * Whether the step from `prev` to `next` is an account's first recorded
 * session. Pure.
 *
 * @param prev - The store before the update
 * @param next - The store after it
 * @param now - The current time in ms, injectable for tests
 */
export function isFirstSessionRecorded(prev: SessionListState, next: SessionListState, now: number = Date.now()): boolean {
  if (prev.sessions.length !== 0 || next.sessions.length !== 1) return false
  // A load in progress, or one that just finished: the list was fetched.
  if (prev.isLoading || next.isLoading) return false
  const started = Date.parse(next.sessions[0].timestamp)
  return Number.isFinite(started) && Math.abs(now - started) < FRESH_SESSION_MS
}

/**
 * Watch the stats store and send `first_session` when it happens. Returns the
 * function that stops watching.
 */
export function watchFirstSession(): () => void {
  return useStatsStore.subscribe((next, prev) => {
    try {
      if (isFirstSessionRecorded(prev, next)) void trackEvent('first_session')
    } catch {
      // A listener that throws would break every other subscriber's update.
    }
  })
}

/**
 * Mounted once in `App`. Watches only while someone is signed in: a first
 * session belongs to an account, and the server ignores one without.
 *
 * @param signedIn - Whether there is a session
 */
export function useFirstSessionEvent(signedIn: boolean): void {
  useEffect(() => {
    if (!signedIn) return
    return watchFirstSession()
  }, [signedIn])
}
