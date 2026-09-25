import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getVisitorId, newVisitorId, VISITOR_ID_KEY } from './visitor'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

beforeEach(() => localStorage.clear())

describe('newVisitorId', () => {
  it('is a v4 UUID and differs each time', () => {
    const a = newVisitorId()
    const b = newVisitorId()
    expect(a).toMatch(UUID)
    expect(b).toMatch(UUID)
    expect(a).not.toBe(b)
  })

  it('falls back to getRandomValues when randomUUID is missing', () => {
    const original = globalThis.crypto.randomUUID
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true })
    try {
      expect(newVisitorId()).toMatch(UUID)
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', { value: original, configurable: true })
    }
  })
})

describe('getVisitorId', () => {
  it('creates one id and returns the same one afterwards', () => {
    const first = getVisitorId()
    expect(first).toMatch(UUID)
    expect(localStorage.getItem(VISITOR_ID_KEY)).toBe(first)
    expect(getVisitorId()).toBe(first)
  })

  it('lives under the bjt_ prefix, so the sign-out wipe rotates it', () => {
    expect(VISITOR_ID_KEY.startsWith('bjt_')).toBe(true)
  })

  it('replaces a stored value that is not a UUID', () => {
    localStorage.setItem(VISITOR_ID_KEY, 'not-an-id')
    const id = getVisitorId()
    expect(id).toMatch(UUID)
    expect(localStorage.getItem(VISITOR_ID_KEY)).toBe(id)
  })

  it('returns null, not a fresh id per call, when storage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    try {
      expect(getVisitorId()).toBeNull()
    } finally {
      spy.mockRestore()
    }
  })
})
