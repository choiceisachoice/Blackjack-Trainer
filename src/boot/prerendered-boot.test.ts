import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  BOOT_HOLD_ATTR,
  beginPrerenderedBoot,
  endPrerenderedBoot,
  isPrerenderedBoot,
  releaseBootHold,
} from './prerendered-boot'
import { LOCALES, LOCALE_STORAGE_KEY } from '../i18n/locales'

afterEach(() => {
  endPrerenderedBoot()
  document.documentElement.removeAttribute(BOOT_HOLD_ATTR)
  document.documentElement.lang = 'en'
  window.history.replaceState({}, '', '/')
  localStorage.clear()
})

describe('the prerendered-boot flag', () => {
  it('is down unless a replacing commit is in progress', () => {
    expect(isPrerenderedBoot()).toBe(false)
  })

  it('is up between begin and end, and only then', () => {
    beginPrerenderedBoot()
    expect(isPrerenderedBoot()).toBe(true)
    endPrerenderedBoot()
    // Everything mounted after the first commit is an ordinary mount: a
    // section reached by client-side navigation keeps its entrance.
    expect(isPrerenderedBoot()).toBe(false)
  })

  it('releases a held page, and does nothing when none was held', () => {
    document.documentElement.setAttribute(BOOT_HOLD_ATTR, 'hold')
    releaseBootHold()
    expect(document.documentElement.hasAttribute(BOOT_HOLD_ATTR)).toBe(false)
    expect(() => releaseBootHold()).not.toThrow()
  })
})

/**
 * `public/boot.js` runs before any module and cannot import anything, so it
 * carries its own copy of the language list and the storage key. These tests
 * run the real file and hold the copies to the originals.
 */
describe('public/boot.js', () => {
  const source = readFileSync(resolve(process.cwd(), 'public/boot.js'), 'utf8')

  function run({ path, pageLang, stored, browser }: { path: string; pageLang: string; stored?: string; browser?: string }) {
    window.history.replaceState({}, '', path)
    document.documentElement.lang = pageLang
    if (stored) localStorage.setItem(LOCALE_STORAGE_KEY, stored)
    const nav = { language: browser ?? 'en-US' }
    // The file is an IIFE over the page's globals; hand it this test's.
    new Function('document', 'location', 'localStorage', 'navigator', 'setTimeout', source)(
      document, window.location, localStorage, nav, () => 0,
    )
    return document.documentElement.getAttribute(BOOT_HOLD_ATTR)
  }

  it('leaves an English page alone for an English reader', () => {
    expect(run({ path: '/', pageLang: 'en', browser: 'en-GB' })).toBeNull()
  })

  it('holds the English page for a reader whose browser is German', () => {
    expect(run({ path: '/learn', pageLang: 'en', browser: 'de-CH' })).toBe('hold')
  })

  it('lets a stored choice outrank the browser, in both directions', () => {
    expect(run({ path: '/', pageLang: 'en', stored: 'en', browser: 'de-DE' })).toBeNull()
    document.documentElement.removeAttribute(BOOT_HOLD_ATTR)
    localStorage.clear()
    expect(run({ path: '/', pageLang: 'en', stored: 'fr', browser: 'en-US' })).toBe('hold')
  })

  it('never holds a page whose URL names its language', () => {
    // `/de/learn` is prerendered in German; whatever the browser says, it is
    // already the right page and must be readable from the first paint.
    expect(run({ path: '/de/learn', pageLang: 'de', browser: 'en-US' })).toBeNull()
    expect(run({ path: '/de', pageLang: 'de', stored: 'fr' })).toBeNull()
  })

  it('does not mistake a path that merely starts with two letters for a language', () => {
    expect(run({ path: '/app', pageLang: 'en', browser: 'en-US' })).toBeNull()
  })

  it('treats a language the site does not have as English', () => {
    expect(run({ path: '/', pageLang: 'en', browser: 'ja-JP' })).toBeNull()
  })

  it('knows the same languages and the same storage key as the app', () => {
    const list = /var LOCALES = \[([^\]]+)\]/.exec(source)?.[1].replace(/['\s]/g, '').split(',')
    expect(list).toEqual([...LOCALES])
    expect(source).toContain(`localStorage.getItem('${LOCALE_STORAGE_KEY}')`)
    expect(source).toContain(`'${BOOT_HOLD_ATTR}'`)
  })
})
