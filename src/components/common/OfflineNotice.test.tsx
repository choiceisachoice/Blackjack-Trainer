import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const state = vi.hoisted(() => ({ configured: true, status: 'signedIn' as string }))
vi.mock('../../services/supabase/client', () => ({
  get isSupabaseConfigured() { return state.configured },
  supabase: null,
}))
vi.mock('../../store/auth-store', () => ({
  useAuthStore: (select: (s: { status: string }) => unknown) => select({ status: state.status }),
  get isSupabaseConfigured() { return state.configured },
}))

import { OfflineNotice, RESTORED_VISIBLE_MS } from './OfflineNotice'
import {
  confirmSessionsUploaded, markSessionPending, markUploadFailed, resetPendingSessions,
} from '../../services/storage/pending-sessions'

/**
 * The offline notice, with the Supabase client mocked.
 *
 * The dev server runs without Supabase, where the notice renders nothing by
 * design — so everything about the configured case is established here and
 * nowhere else.
 */

function setBrowserOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
  window.dispatchEvent(new Event(online ? 'online' : 'offline'))
}
const startOffline = () =>
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })

const show = (path = '/app') => render(<MemoryRouter initialEntries={[path]}><OfflineNotice /></MemoryRouter>)
const notice = () => screen.queryByTestId('offline-notice')

beforeEach(() => {
  state.configured = true
  state.status = 'signedIn'
  localStorage.clear()
  resetPendingSessions()
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
  document.documentElement.style.removeProperty('--offline-bar')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
})

describe('OfflineNotice', () => {
  it('is not there while everything is fine', () => {
    show()
    expect(notice()).toBeNull()
  })

  it('appears when the connection goes away, and says the training is safe', () => {
    show()
    act(() => setBrowserOnline(false))
    expect(notice()).toHaveAttribute('data-state', 'offline')
    expect(notice()).toHaveTextContent(
      'No connection — your training is saved on this device and will be uploaded when you are back online.',
    )
  })

  it('is there from the first render when the app is opened without a connection', () => {
    startOffline()
    show()
    expect(notice()).toHaveAttribute('data-state', 'offline')
  })

  it('is a status line, not a dialog, and lets every click through', () => {
    show()
    act(() => setBrowserOnline(false))
    expect(notice()).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(notice()?.className).toContain('pointer-events-none')
    expect(notice()?.querySelector('button, a')).toBeNull()
  })

  it('says "back online" when the connection returns, then leaves by itself', () => {
    vi.useFakeTimers()
    show()
    act(() => setBrowserOnline(false))
    act(() => setBrowserOnline(true))

    expect(notice()).toHaveAttribute('data-state', 'restored')
    expect(notice()).toHaveTextContent('Back online — everything is saved.')

    act(() => { vi.advanceTimersByTime(RESTORED_VISIBLE_MS - 1) })
    expect(notice()).not.toBeNull()
    act(() => { vi.advanceTimersByTime(1) })
    expect(notice()).toBeNull()
  })

  it('appears when a save had to stay on the device, although the browser says it is online', () => {
    show()
    act(() => { markSessionPending('s1'); markUploadFailed() })
    expect(notice()).toHaveAttribute('data-state', 'offline')
  })

  it('does not appear for a save that is merely on its way', () => {
    show()
    act(() => markSessionPending('s1'))
    expect(notice()).toBeNull()
    act(() => confirmSessionsUploaded(['s1']))
    expect(notice()).toBeNull()
  })

  it('does not say "everything is saved" until the waiting sessions are uploaded', () => {
    vi.useFakeTimers()
    show()
    act(() => { setBrowserOnline(false); markSessionPending('s1'); markUploadFailed() })

    // The connection is back, the upload has not finished.
    act(() => setBrowserOnline(true))
    expect(notice()).toHaveAttribute('data-state', 'offline')

    act(() => confirmSessionsUploaded(['s1']))
    expect(notice()).toHaveAttribute('data-state', 'restored')

    act(() => { vi.advanceTimersByTime(RESTORED_VISIBLE_MS) })
    expect(notice()).toBeNull()
  })

  it('goes back to the offline line if the connection drops again during "back online"', () => {
    vi.useFakeTimers()
    show()
    act(() => setBrowserOnline(false))
    act(() => setBrowserOnline(true))
    act(() => setBrowserOnline(false))
    expect(notice()).toHaveAttribute('data-state', 'offline')
    // The old timer must not hide a notice that is true again.
    act(() => { vi.advanceTimersByTime(RESTORED_VISIBLE_MS * 2) })
    expect(notice()).toHaveAttribute('data-state', 'offline')
  })

  it('renders nothing in a build without Supabase — there is nothing to upload to', () => {
    state.configured = false
    startOffline()
    show()
    expect(notice()).toBeNull()
    act(() => { markSessionPending('s1'); markUploadFailed() })
    expect(notice()).toBeNull()
  })

  it('renders nothing for someone who is signed out', () => {
    state.status = 'signedOut'
    startOffline()
    show()
    expect(notice()).toBeNull()
  })

  it.each(['/', '/learn', '/de/learn/true-count', '/login'])('renders nothing on the public page %s', path => {
    startOffline()
    show(path)
    expect(notice()).toBeNull()
  })

  it.each(['/app', '/app/casino', '/de/app/speed', '/account'])('is shown inside the app at %s', path => {
    startOffline()
    show(path)
    expect(notice()).not.toBeNull()
  })

  describe('where it sits', () => {
    it('goes across the top and makes the shell give it room', () => {
      show()
      act(() => setBrowserOnline(false))
      expect(notice()).toHaveAttribute('data-placement', 'bar')
      expect(notice()?.style.top).toBe('0px')
      expect(document.documentElement.style.getPropertyValue('--offline-bar')).toMatch(/^\d+px$/)
    })

    it('takes the room back when it leaves', () => {
      vi.useFakeTimers()
      show()
      act(() => setBrowserOnline(false))
      act(() => setBrowserOnline(true))
      act(() => { vi.advanceTimersByTime(RESTORED_VISIBLE_MS) })
      expect(document.documentElement.style.getPropertyValue('--offline-bar')).toBe('')
    })

    it('lies over the top rim of a live casino table and takes no room from it', () => {
      // The table sizes itself to the height that is left; the strip must not
      // change that height mid-hand.
      const hud = document.createElement('div')
      hud.setAttribute('data-testid', 'session-hud')
      hud.getClientRects = () => [{}] as unknown as DOMRectList
      hud.getBoundingClientRect = () => ({ bottom: 48 }) as DOMRect
      document.body.appendChild(hud)
      try {
        show('/app/casino')
        act(() => setBrowserOnline(false))
        expect(notice()).toHaveAttribute('data-placement', 'table')
        expect(notice()?.style.top).toBe('48px')
        expect(document.documentElement.style.getPropertyValue('--offline-bar')).toBe('')
      } finally {
        hud.remove()
      }
    })

    it('ignores a table that is mounted but hidden behind another screen', () => {
      const hud = document.createElement('div')
      hud.setAttribute('data-testid', 'session-hud')
      hud.getClientRects = () => [] as unknown as DOMRectList
      document.body.appendChild(hud)
      try {
        show()
        act(() => setBrowserOnline(false))
        expect(notice()).toHaveAttribute('data-placement', 'bar')
      } finally {
        hud.remove()
      }
    })
  })
})
