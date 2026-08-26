import { describe, it, expect, beforeEach } from 'vitest'
import { useLiveSessionStore } from './live-session-store'
import { useAppStore, type AppMode } from './app-store'

/**
 * The guard that stands between a misclick and half an hour of play.
 *
 * The Casino Session holds its engine and its shoe in refs inside a component.
 * Switching mode unmounts that component, and nothing warned anybody. These
 * tests pin the behaviour that makes the loss impossible to trigger by accident.
 */

const store = () => useLiveSessionStore.getState()
/** Where the user is standing. The guard's answer depends on it. */
const standingIn = (mode: AppMode) => useAppStore.setState({ currentMode: mode })

beforeEach(() => {
  useLiveSessionStore.setState({ activeMode: null, pending: null })
  standingIn('home')
})

describe('with no session running', () => {
  it('lets navigation through untouched', () => {
    expect(store().requestLeave('home')).toBe(true)
    expect(store().pending).toBeNull()
  })

  it('asks nothing, so nothing can be clicked away out of habit', () => {
    store().requestLeave('speedDrill')
    store().requestLeave('learn')
    expect(store().pending).toBeNull()
  })
})

describe('standing in a running session', () => {
  beforeEach(() => {
    store().beginSession('casinoSession')
    standingIn('casinoSession')
  })

  it('refuses the navigation and raises the question instead', () => {
    expect(store().requestLeave('home')).toBe(false)
    expect(store().pending).toEqual({ target: { kind: 'mode', mode: 'home' }, from: 'casinoSession' })
  })

  it('remembers where the user was trying to go', () => {
    store().requestLeave('learn')
    expect(store().confirmLeave()).toEqual({ kind: 'mode', mode: 'learn' })
  })

  it('stays put when the user backs out, and keeps the session', () => {
    store().requestLeave('home')
    store().cancelLeave()
    expect(store().pending).toBeNull()
    expect(store().activeMode).toBe('casinoSession')
  })

  it('does not ask when the target is the mode already running', () => {
    // Clicking the nav item you are already on cannot discard anything. Asking
    // there teaches people to dismiss the dialog without reading it, and a
    // confirmation people dismiss by reflex protects nothing.
    expect(store().requestLeave('casinoSession')).toBe(true)
    expect(store().pending).toBeNull()
  })

  it('leaves the ending to whoever owns the session, not to the guard', () => {
    // `confirmLeave` answers the question; it does not decide the session's
    // fate. Today the Casino Session unmounts on a mode change and reports
    // `endSession` itself. When the shell keeps it mounted instead, that call
    // simply stops happening and nothing in this store has to change.
    store().requestLeave('home')
    store().confirmLeave()
    expect(store().activeMode).toBe('casinoSession')
  })
})

/**
 * The bug this suite exists for.
 *
 * The Casino Session stays mounted in the background so a paused hand survives
 * a mode change — which means `activeMode` stays set long after the user has
 * left, been asked, and answered. Consulting only `activeMode` turned every
 * later navigation into the same question about a session nobody was in.
 */
describe('with a session paused in the background', () => {
  beforeEach(() => {
    store().beginSession('casinoSession')
    standingIn('home')
  })

  it('does not ask again once the user is somewhere else', () => {
    expect(store().requestLeave('speedDrill')).toBe(true)
    expect(store().pending).toBeNull()
  })

  it('does not ask on the way home from an unrelated mode', () => {
    standingIn('speedDrill')
    expect(store().requestLeave('home')).toBe(true)
    expect(store().pending).toBeNull()
  })

  it('still lets the user walk straight back into the session', () => {
    expect(store().requestLeave('casinoSession')).toBe(true)
    expect(store().pending).toBeNull()
  })

  it('keeps the session alive — not asking is not the same as ending', () => {
    store().requestLeave('analytics')
    expect(store().activeMode).toBe('casinoSession')
  })

  it('asks again the moment the user is back on the session screen', () => {
    standingIn('casinoSession')
    expect(store().requestLeave('home')).toBe(false)
    expect(store().pending).toEqual({ target: { kind: 'mode', mode: 'home' }, from: 'casinoSession' })
  })
})

describe('when the session ends', () => {
  it('stops guarding, so the summary screen is not a trap', () => {
    store().beginSession('casinoSession')
    standingIn('casinoSession')
    store().endSession()
    expect(store().requestLeave('home')).toBe(true)
  })

  it('withdraws a question that is no longer about anything', () => {
    // The last hand can finish while the dialog is open. Leaving it up would
    // ask whether to discard a session that has already been recorded.
    store().beginSession('casinoSession')
    standingIn('casinoSession')
    store().requestLeave('home')
    store().endSession()
    expect(store().pending).toBeNull()
  })
})

describe('confirmLeave without a pending question', () => {
  it('returns null instead of inventing a destination', () => {
    expect(store().confirmLeave()).toBeNull()
  })
})

describe('leaving the app rather than switching mode', () => {
  beforeEach(() => {
    useLiveSessionStore.setState({ activeMode: null, pending: null })
    useAppStore.setState({ currentMode: 'home' })
  })

  /**
   * The account and sign-out buttons navigate by route, and a route change
   * unmounts `TrainerApp` — the engine, the shoe and the clock go with it. So
   * unlike a mode switch, there is no screen from which this is harmless, and
   * the "are you standing on the table" condition must not apply.
   */
  it('asks even when the user is somewhere else in the app', () => {
    store().beginSession('casinoSession')
    useAppStore.setState({ currentMode: 'analytics' })

    // A mode switch from here is free — the session stays mounted.
    expect(store().requestLeave('home')).toBe(true)
    expect(store().pending).toBeNull()

    // Leaving the app from the same screen is not.
    expect(store().requestLeaveApp({ kind: 'route', path: '/account' })).toBe(false)
    expect(store().pending).toEqual({
      target: { kind: 'route', path: '/account' },
      from: 'casinoSession',
    })
    expect(store().confirmLeave()).toEqual({ kind: 'route', path: '/account' })
  })

  it('carries sign-out as its own kind, not as a route', () => {
    store().beginSession('casinoSession')
    expect(store().requestLeaveApp({ kind: 'signOut' })).toBe(false)
    // Not a path: signing out revokes the session and wipes this device before
    // it goes anywhere, so a route would have skipped the part that matters.
    expect(store().confirmLeave()).toEqual({ kind: 'signOut' })
  })

  it('does not ask when there is no session to lose', () => {
    expect(store().requestLeaveApp({ kind: 'signOut' })).toBe(true)
    expect(store().pending).toBeNull()
  })
})
