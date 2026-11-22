import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const signOutAndClearLocal = vi.hoisted(() =>
  vi.fn<(options?: { discardUnsaved?: boolean }) => Promise<'signedOut' | 'unsaved'>>())
vi.mock('../services/supabase/cloud-sync', () => ({ signOutAndClearLocal }))
// Stands in for the module that registers the saved table's cash-out when it
// loads; the factory runs when the module is first imported.
const settler = vi.hoisted(() => ({ loads: 0 }))
vi.mock('../components/casino-session/record-session', () => {
  settler.loads++
  return {}
})

import { useGuardedSignOut } from './use-guarded-sign-out'
import { LIVE_SESSION_KEY } from '../services/casino-live-session'
import { markSessionPending, resetPendingSessions } from '../services/storage/pending-sessions'

beforeEach(() => {
  localStorage.clear()
  resetPendingSessions()
  signOutAndClearLocal.mockReset()
  signOutAndClearLocal.mockResolvedValue('signedOut')
})

describe('useGuardedSignOut', () => {
  it('does not fetch the table code when no table is saved', async () => {
    const { result } = renderHook(() => useGuardedSignOut(vi.fn()))
    await act(() => result.current.signOut())
    expect(settler.loads).toBe(0)
  })

  it('loads the code that cashes out a saved table before the sign-out runs', async () => {
    localStorage.setItem(LIVE_SESSION_KEY, '{}')
    let loadedWhenSigningOut = -1
    signOutAndClearLocal.mockImplementation(async () => {
      loadedWhenSigningOut = settler.loads
      return 'signedOut'
    })
    const { result } = renderHook(() => useGuardedSignOut(vi.fn()))
    await act(() => result.current.signOut())
    expect(loadedWhenSigningOut).toBe(1)
  })

  it('signs out and tells the caller, without asking anything', async () => {
    const onSignedOut = vi.fn()
    const { result } = renderHook(() => useGuardedSignOut(onSignedOut))

    await act(() => result.current.signOut())

    expect(signOutAndClearLocal).toHaveBeenCalledTimes(1)
    expect(signOutAndClearLocal.mock.calls[0][0]?.discardUnsaved).toBeFalsy()
    expect(onSignedOut).toHaveBeenCalledOnce()
    expect(result.current.unsavedCount).toBeNull()
    // Stays busy: the page is leaving.
    expect(result.current.busy).toBe(true)
  })

  it('asks instead of leaving when sessions could not be uploaded, and says how many', async () => {
    markSessionPending('a')
    markSessionPending('b')
    signOutAndClearLocal.mockResolvedValue('unsaved')
    const onSignedOut = vi.fn()
    const { result } = renderHook(() => useGuardedSignOut(onSignedOut))

    await act(() => result.current.signOut())

    expect(onSignedOut).not.toHaveBeenCalled()
    expect(result.current.unsavedCount).toBe(2)
    // The control works again: the person is still signed in.
    expect(result.current.busy).toBe(false)
  })

  it('"stay" closes the question and does nothing else', async () => {
    markSessionPending('a')
    signOutAndClearLocal.mockResolvedValue('unsaved')
    const onSignedOut = vi.fn()
    const { result } = renderHook(() => useGuardedSignOut(onSignedOut))
    await act(() => result.current.signOut())

    act(() => result.current.stay())

    expect(result.current.unsavedCount).toBeNull()
    expect(signOutAndClearLocal).toHaveBeenCalledTimes(1)
    expect(onSignedOut).not.toHaveBeenCalled()
  })

  it('"sign out anyway" calls again, giving the sessions up', async () => {
    markSessionPending('a')
    signOutAndClearLocal.mockResolvedValueOnce('unsaved')
    const onSignedOut = vi.fn()
    const { result } = renderHook(() => useGuardedSignOut(onSignedOut))
    await act(() => result.current.signOut())

    await act(() => result.current.signOutAnyway())

    expect(signOutAndClearLocal).toHaveBeenLastCalledWith({ discardUnsaved: true })
    expect(onSignedOut).toHaveBeenCalledOnce()
    expect(result.current.unsavedCount).toBeNull()
  })

  it('ignores a second click while the first is in flight', async () => {
    let finish: (v: 'signedOut') => void = () => {}
    signOutAndClearLocal.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const { result } = renderHook(() => useGuardedSignOut(() => {}))

    let first: Promise<void> = Promise.resolve()
    act(() => {
      first = result.current.signOut()
      void result.current.signOut()
    })
    expect(result.current.busy).toBe(true)
    expect(signOutAndClearLocal).toHaveBeenCalledTimes(1)

    await act(async () => { finish('signedOut'); await first })
  })
})
