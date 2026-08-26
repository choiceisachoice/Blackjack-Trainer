import { describe, it, expect } from 'vitest'
import { authErrorKey, GENERIC_AUTH_ERROR, AUTH_ERROR_KEYS } from './auth-errors'
import en from '../i18n/messages/en.json'

/** Read a dotted key out of the message tree. */
function lookup(key: string): unknown {
  return key.split('.').reduce<unknown>(
    (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
    en
  )
}

describe('authErrorKey', () => {
  it('prefers the stable code over the message text', () => {
    expect(authErrorKey({ code: 'invalid_credentials', message: 'anything at all' }))
      .toBe('errors.auth.invalidCredentials')
  })

  it('falls back to the message for errors that carry no code', () => {
    expect(authErrorKey({ message: 'Invalid login credentials' }))
      .toBe('errors.auth.invalidCredentials')
    expect(authErrorKey({ message: 'User already registered' }))
      .toBe('errors.auth.emailTaken')
    expect(authErrorKey({ message: 'Email rate limit exceeded' }))
      .toBe('errors.auth.rateLimit')
  })

  /**
   * The point of the whole module. An unrecognised message is the one most
   * likely to be written for a developer, so it must never reach the screen.
   */
  it('never returns the raw message for something it does not recognise', () => {
    const raw = 'Edge Function returned a non-2xx status code'
    const key = authErrorKey({ message: raw })
    expect(key).toBe(GENERIC_AUTH_ERROR)
    expect(key).not.toContain(raw)
  })

  it('every key it can produce exists in the messages', () => {
    const missing = AUTH_ERROR_KEYS.filter(k => typeof lookup(k) !== 'string')
    expect(missing).toEqual([])
  })
})
