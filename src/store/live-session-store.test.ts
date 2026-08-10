import { describe, it, expect, beforeEach } from 'vitest'
import { useLiveSessionStore } from './live-session-store'

/**
 * The guard that stands between a misclick and half an hour of play.
 *
 * The Casino Session holds its engine and its shoe in refs inside a component.
 * Switching mode unmounts that component, and nothing warned anybody. These
 * tests pin the behaviour that makes the loss impossible to trigger by accident.
 */

const store = () => useLiveSessionStore.getState()

beforeEach(() => {
  useLiveSessionStore.setState({ activeMode: null, pending: null })
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

describe('with a session running', () => {
  beforeEach(() => store().beginSession('casinoSession'))

  it('refuses the navigation and raises the question instead', () => {
    expect(store().requestLeave('home')).toBe(false)
    expect(store().pending).toEqual({ target: 'home', from: 'casinoSession' })
  })

  it('remembers where the user was trying to go', () => {
    store().requestLeave('learn')
    expect(store().confirmLeave()).toBe('learn')
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

describe('when the session ends', () => {
  it('stops guarding, so the summary screen is not a trap', () => {
    store().beginSession('casinoSession')
    store().endSession()
    expect(store().requestLeave('home')).toBe(true)
  })

  it('withdraws a question that is no longer about anything', () => {
    // The last hand can finish while the dialog is open. Leaving it up would
    // ask whether to discard a session that has already been recorded.
    store().beginSession('casinoSession')
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
