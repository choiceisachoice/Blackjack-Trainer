import { describe, it, expect } from 'vitest'
import { LOCALES, LOCALE_NAMES, DEFAULT_LOCALE, resolveLocale, isLocale } from './locales'

// Suffixed on purpose: the Italian bundle imported as `it` shadows vitest's
// `it`, and every test in the file then fails with "is not a function".
import enMessages from './messages/en.json'
import deMessages from './messages/de.json'
import frMessages from './messages/fr.json'
import itMessages from './messages/it.json'
import esMessages from './messages/es.json'
import ptMessages from './messages/pt.json'
import trMessages from './messages/tr.json'

/**
 * The translations have to stay the same shape.
 *
 * Seven files edited by hand drift: a key added to English and forgotten in
 * Turkish renders as English for Turkish readers, which is survivable — but a
 * key *renamed* in one file and not the others renders the raw dotted path,
 * which is not. Neither failure produces an error at runtime, so nothing
 * catches it except a test that compares the sets.
 */

const BUNDLES = {
  en: enMessages, de: deMessages, fr: frMessages, it: itMessages,
  es: esMessages, pt: ptMessages, tr: trMessages,
} as const

/** Every leaf path in an object, as `a.b.c`. */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k))
}

/** Placeholders like {{hand}} — these must survive translation verbatim. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()
}

/**
 * Markup tags like <c>…</c> — the emphasis the Trans component fills in.
 *
 * Returned sorted and counted, because what matters is that a translation uses
 * the same set of tags as its English original: an unbalanced or invented tag
 * does not throw, it renders as literal text in the middle of a sentence.
 */
function tags(text: string): string[] {
  return [...text.matchAll(/<\/?(\w+)>/g)].map(m => m[0]).sort()
}

/** Every leaf string, keyed by path. */
function flatten(value: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (typeof value === 'string') { out[prefix] = value; return out }
  if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out)
    }
  }
  return out
}

const enKeys = keyPaths(enMessages).sort()
const enFlat = flatten(enMessages)

describe('the set of languages', () => {
  it('has a bundle for every locale offered in the switcher', () => {
    // Offering a language with no messages would show a switcher entry that
    // silently does nothing but flip the page back to English.
    for (const locale of LOCALES) {
      expect(Object.keys(BUNDLES)).toContain(locale)
    }
  })

  it('names every language in its own words', () => {
    for (const locale of LOCALES) {
      expect(LOCALE_NAMES[locale]?.trim().length ?? 0).toBeGreaterThan(0)
    }
  })

  it('starts from English, because that is the fallback', () => {
    expect(DEFAULT_LOCALE).toBe('en')
    expect(LOCALES[0]).toBe('en')
  })
})

describe.each(LOCALES.filter(l => l !== 'en'))('the %s translation', locale => {
  const bundle = BUNDLES[locale]

  it('has exactly the same keys as English — none missing, none stray', () => {
    expect(keyPaths(bundle).sort()).toEqual(enKeys)
  })

  it('keeps every placeholder, so no number goes missing from a sentence', () => {
    // A dropped {{hand}} does not throw; it just leaves a sentence that reads
    // "Paused on hand ." to whoever speaks that language.
    const flat = flatten(bundle)
    for (const [path, english] of Object.entries(enFlat)) {
      expect(placeholders(flat[path] ?? ''), `${locale} · ${path}`).toEqual(placeholders(english))
    }
  })

  it('carries the same emphasis tags, so none renders as literal text', () => {
    // The Learn chapters and the paywall sentences put <c> and <g> inside the
    // prose so each language can emphasise its own words. A tag that is
    // mistyped or left unclosed is not an error — it is printed on the page.
    const flat = flatten(bundle)
    for (const [path, english] of Object.entries(enFlat)) {
      expect(tags(flat[path] ?? ''), `${locale} · ${path}`).toEqual(tags(english))
    }
  })

  it('translates rather than copying English wholesale', () => {
    // A few identical strings are correct — "Pro", "Casino", "Plan", "Bankroll".
    // A bundle that is mostly identical is an untranslated file that looks done.
    const flat = flatten(bundle)
    const paths = Object.keys(enFlat)
    const identical = paths.filter(p => flat[p] === enFlat[p])
    expect(identical.length / paths.length).toBeLessThan(0.35)
  })

  it('leaves no empty strings behind', () => {
    for (const [path, text] of Object.entries(flatten(bundle))) {
      expect(text.trim().length, `${locale} · ${path}`).toBeGreaterThan(0)
    }
  })
})

describe('resolveLocale', () => {
  it('accepts a plain language tag', () => {
    expect(resolveLocale('de')).toBe('de')
  })

  it('accepts a regional tag, because most browsers send one', () => {
    // Refusing `de-CH` would put a Swiss visitor on the English site — on a
    // Swiss company's product.
    expect(resolveLocale('de-CH')).toBe('de')
    expect(resolveLocale('pt-BR')).toBe('pt')
    expect(resolveLocale('en-GB')).toBe('en')
  })

  it('falls back to English for a language we do not have', () => {
    expect(resolveLocale('ja')).toBe('en')
    expect(resolveLocale('')).toBe('en')
    expect(resolveLocale(null)).toBe('en')
  })

  it('is not fooled by case or an underscore separator', () => {
    expect(resolveLocale('FR_ch')).toBe('fr')
  })
})

describe('isLocale', () => {
  it('accepts what we support and rejects everything else', () => {
    expect(isLocale('tr')).toBe(true)
    expect(isLocale('ja')).toBe(false)
    expect(isLocale(42)).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })
})
