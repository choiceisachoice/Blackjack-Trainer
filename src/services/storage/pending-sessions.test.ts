import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  PENDING_SESSIONS_KEY,
  confirmSessionsUploaded,
  getPendingSessionIds,
  getPendingSnapshot,
  markSessionPending,
  markUploadFailed,
  resetPendingSessions,
  subscribePendingSessions,
} from './pending-sessions'

beforeEach(() => {
  localStorage.clear()
  resetPendingSessions()
})

describe('the list of sessions waiting for the cloud', () => {
  it('is empty to begin with', () => {
    expect(getPendingSessionIds()).toEqual([])
    expect(getPendingSnapshot()).toEqual({ count: 0, failed: false })
  })

  it('keeps an id in storage, so a closed tab does not forget it', () => {
    markSessionPending('a')
    expect(JSON.parse(localStorage.getItem(PENDING_SESSIONS_KEY) ?? '[]')).toEqual(['a'])
  })

  it('lists an id once however often it is marked', () => {
    markSessionPending('a')
    markSessionPending('a')
    expect(getPendingSessionIds()).toEqual(['a'])
  })

  it('is not "failed" while a first upload is merely in flight', () => {
    markSessionPending('a')
    expect(getPendingSnapshot()).toEqual({ count: 1, failed: false })
  })

  it('is failed once an attempt has failed, until everything has arrived', () => {
    markSessionPending('a')
    markSessionPending('b')
    markUploadFailed()
    expect(getPendingSnapshot()).toEqual({ count: 2, failed: true })

    confirmSessionsUploaded(['a'])
    expect(getPendingSnapshot()).toEqual({ count: 1, failed: true })

    confirmSessionsUploaded(['b'])
    expect(getPendingSnapshot()).toEqual({ count: 0, failed: false })
    expect(localStorage.getItem(PENDING_SESSIONS_KEY)).toBeNull()
  })

  it('does not call a later session stranded because of an old failure', () => {
    // A failure with nothing waiting must not leave a flag standing.
    markUploadFailed()
    markSessionPending('a')
    expect(getPendingSnapshot()).toEqual({ count: 1, failed: false })
  })

  it('tells subscribers about every change, and stops when asked', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePendingSessions(listener)
    markSessionPending('a')
    markUploadFailed()
    confirmSessionsUploaded(['a'])
    expect(listener).toHaveBeenCalledTimes(3)
    unsubscribe()
    markSessionPending('b')
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('announces a repeated failure too — the retry schedule counts attempts off it', () => {
    markSessionPending('a')
    markUploadFailed()
    const listener = vi.fn()
    subscribePendingSessions(listener)
    markUploadFailed()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('returns the same snapshot object until something changes', () => {
    markSessionPending('a')
    expect(getPendingSnapshot()).toBe(getPendingSnapshot())
  })

  it('survives a corrupt key', () => {
    localStorage.setItem(PENDING_SESSIONS_KEY, '{not json')
    resetPendingSessions()
    localStorage.setItem(PENDING_SESSIONS_KEY, '{not json')
    expect(getPendingSessionIds()).toEqual([])
  })

  it('is forgotten by the sign-out wipe', () => {
    markSessionPending('a')
    markUploadFailed()
    resetPendingSessions()
    expect(getPendingSnapshot()).toEqual({ count: 0, failed: false })
    expect(localStorage.getItem(PENDING_SESSIONS_KEY)).toBeNull()
  })
})
