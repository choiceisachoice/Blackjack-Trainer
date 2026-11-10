import { describe, it, expect, beforeEach } from 'vitest'
import { readArrivalRef, arrivalRef, resetArrivalRefForTest, isQrArrival, withoutRefParam, rememberQrReward, hasQrReward, qrWelcomeShown, markQrWelcomeShown, QR_REF, QR_SOURCE } from './qr-reward'

/**
 * The QR code in the casino-games video points at `/?ref=qr`.
 *
 * What this module has to get right is small and easy to break: the parameter
 * is read once per page load (the landing page removes it from the address bar,
 * and the page-view tracker must still see it), it is matched exactly, and the
 * address that is left behind keeps every other parameter.
 */

beforeEach(() => {
  resetArrivalRefForTest()
  localStorage.clear()
})

describe('readArrivalRef', () => {
  it('reads the ref parameter', () => {
    expect(readArrivalRef('?ref=qr')).toBe('qr')
  })

  it('lower-cases and trims it, so a hand-typed QR=QR still counts', () => {
    expect(readArrivalRef('?ref=%20QR%20')).toBe('qr')
  })

  it('is null without the parameter, or with an empty one', () => {
    expect(readArrivalRef('')).toBeNull()
    expect(readArrivalRef('?checkout=success')).toBeNull()
    expect(readArrivalRef('?ref=')).toBeNull()
  })

  it('ignores anything that is not a short plain word', () => {
    expect(readArrivalRef('?ref=' + 'a'.repeat(41))).toBeNull()
    expect(readArrivalRef('?ref=%3Cscript%3E')).toBeNull()
  })
})

describe('arrivalRef', () => {
  it('keeps the first answer for the whole page load', () => {
    expect(arrivalRef('?ref=qr')).toBe('qr')
    // After the landing page strips the parameter, the tracker still sees it.
    expect(arrivalRef('')).toBe('qr')
  })

  it('is null on a visit that did not come from a code', () => {
    expect(arrivalRef('')).toBeNull()
    expect(isQrArrival('')).toBe(false)
  })

  it('knows a QR arrival', () => {
    expect(isQrArrival('?ref=qr')).toBe(true)
    expect(QR_REF).toBe('qr')
  })

  it('names the source the way the analytics report groups it', () => {
    expect(QR_SOURCE).toBe('qr-code')
  })
})

describe('withoutRefParam', () => {
  it('removes ref and keeps everything else', () => {
    expect(withoutRefParam('/', '?ref=qr')).toBe('/')
    expect(withoutRefParam('/', '?ref=qr&utm_source=yt')).toBe('/?utm_source=yt')
    expect(withoutRefParam('/de', '?lang=de&ref=qr')).toBe('/de?lang=de')
  })

  it('keeps the hash', () => {
    expect(withoutRefParam('/', '?ref=qr', '#pricing')).toBe('/#pricing')
  })

  it('leaves an address without the parameter as it was', () => {
    expect(withoutRefParam('/learn', '?x=1')).toBe('/learn?x=1')
  })
})

describe('the welcome, once per page load', () => {
  it('is not shown until marked, and stays marked', () => {
    expect(qrWelcomeShown()).toBe(false)
    markQrWelcomeShown()
    expect(qrWelcomeShown()).toBe(true)
  })
})

describe('the remembered reward', () => {
  it('is absent until a QR arrival is remembered', () => {
    expect(hasQrReward()).toBe(false)
    rememberQrReward()
    expect(hasQrReward()).toBe(true)
  })

  it('survives a reload, because it lives in localStorage', () => {
    rememberQrReward()
    resetArrivalRefForTest()
    expect(hasQrReward()).toBe(true)
  })
})
