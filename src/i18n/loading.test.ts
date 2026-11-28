import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCALE_STORAGE_KEY } from './locales'

/**
 * English is a chunk of its own now (28 Nov 2026), not part of the entry.
 * These pin what that must not cost: the starting language is registered
 * before `localeReady` resolves, English start does not store a choice, and
 * the English fallback still arrives when a key is missing.
 */
describe('loading the messages', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  it('starts in English without storing English as a choice', async () => {
    vi.stubGlobal('navigator', { ...navigator, language: 'en-US' })
    const mod = await import('./index')
    await mod.localeReady
    expect(mod.messagesLoaded()).toBe(true)
    expect(mod.default.hasResourceBundle('en', 'translation')).toBe(true)
    expect(mod.default.t('try.start')).not.toBe('try.start')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull()
    vi.unstubAllGlobals()
  })

  it('starts a prefixed page in its language without fetching English', async () => {
    window.history.replaceState({}, '', '/de/learn')
    const mod = await import('./index')
    await mod.localeReady
    expect(mod.default.language).toBe('de')
    expect(mod.default.hasResourceBundle('de', 'translation')).toBe(true)
    expect(mod.default.hasResourceBundle('en', 'translation')).toBe(false)
  })

  it('fetches English when a key is missing in the language shown', async () => {
    window.history.replaceState({}, '', '/de/')
    const mod = await import('./index')
    await mod.localeReady
    const i18n = mod.default
    i18n.removeResourceBundle('de', 'translation')
    i18n.addResourceBundle('de', 'translation', { only: 'nur' })
    const added = new Promise<void>(resolve => {
      const onAdded = (lng: string) => { if (lng === 'en') { i18n.store.off('added', onAdded); resolve() } }
      i18n.store.on('added', onAdded)
    })
    i18n.t('try.start')
    await added
    expect(i18n.t('try.start')).toBe(i18n.getResource('en', 'translation', 'try.start'))
  })
})
