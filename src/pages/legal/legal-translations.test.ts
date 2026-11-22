import { describe, it, expect } from 'vitest'
import { LOCALES, type Locale } from '../../i18n/locales'
import { LEGAL_META as M, formatLegalDate } from './legal-meta'
import { LEGAL_LOCALE_TAGS, legalDate, legalGoverningLaw, legalLocation, type TranslatedLocale } from './legal-locale'
import { TRANSLATION_NOTICE, isLegalTranslation, legalDoc, legalPath, type LegalKind } from './legal-docs'
import type { LegalDoc } from './legal-types'

// Suffixed on purpose: the Italian bundle imported as `it` would shadow
// vitest's `it` (see `i18n/messages.test.ts`).
import deMessages from '../../i18n/messages/de.json'
import frMessages from '../../i18n/messages/fr.json'
import itMessages from '../../i18n/messages/it.json'
import esMessages from '../../i18n/messages/es.json'
import ptMessages from '../../i18n/messages/pt.json'
import trMessages from '../../i18n/messages/tr.json'

/**
 * The translated Terms and Privacy Policy must not drift from the English.
 *
 * English is the binding text; the six others are translations for
 * convenience. Thirteen long documents edited by hand drift in ways nobody
 * reads for: a bullet added to English and forgotten in Turkish, a retention
 * period changed from 13 to 12 months in one file, a paragraph pasted in
 * untranslated. None of that throws, and a reader of the Turkish page would
 * be told something the operator no longer says. So the shape and the facts
 * are compared mechanically, block by block.
 *
 * What this cannot check is whether a sentence *means* the same. That is
 * what the review in `docs/LEGAL-TRANSLATIONS-2026-11.md` is for.
 */

const TRANSLATED = LOCALES.filter((l): l is TranslatedLocale => l !== 'en')
const KINDS: readonly LegalKind[] = ['privacy', 'terms']

const MESSAGES: Record<TranslatedLocale, typeof deMessages> = {
  de: deMessages, fr: frMessages, it: itMessages, es: esMessages, pt: ptMessages, tr: trMessages,
}

/** One comparable unit of a document, with a label that says where it is. */
interface Unit { where: string; text: string; heading: boolean }

/**
 * Every string of a document in order — title, intro, and per section the
 * heading and each paragraph or bullet — addressed by position, so unit *n*
 * of a translation is the translation of unit *n* of the English.
 */
function units(doc: LegalDoc): Unit[] {
  const out: Unit[] = [
    { where: 'title', text: doc.title, heading: true },
    { where: 'intro', text: doc.intro, heading: false },
  ]
  doc.sections.forEach((s, si) => {
    out.push({ where: `§${si + 1} heading`, text: s.heading, heading: true })
    s.blocks.forEach((b, bi) => {
      if (typeof b === 'string') out.push({ where: `§${si + 1} block ${bi + 1}`, text: b, heading: false })
      else b.list.forEach((item, li) => out.push({ where: `§${si + 1} block ${bi + 1} bullet ${li + 1}`, text: item, heading: false }))
    })
  })
  return out
}

/** The outline of a document: per section, per block, 'p' or the bullet count. */
function shape(doc: LegalDoc): (string | number)[][] {
  return doc.sections.map(s => s.blocks.map(b => (typeof b === 'string' ? 'p' : b.list.length)))
}

/** E-mail addresses in a text. */
const emails = (text: string) => (text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? []).sort()

/** URLs in a text. */
const urls = (text: string) => (text.match(/https?:\/\/[^\s)»”"]+/g) ?? []).sort()

/**
 * Every number in a text, with the decimal mark normalised — "8.1" in
 * English and Swiss German is "8,1" in French, and both are the same rate.
 * Covers the retention periods, the minimum age, the VAT rate, the section
 * number, the postcode and the day and year of the date.
 */
const numbers = (text: string) => (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map(n => n.replace(',', '.')).sort()

/** Amounts of money written with a currency ("CHF 8.90", "69 €"). */
const amounts = (text: string) =>
  (text.match(/(?:CHF|EUR|USD|Fr\.|€|\$)\s?\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s?(?:CHF|EUR|USD|Fr\.|€)/g) ?? [])
    .map(a => a.replace(',', '.').replace(/\s/g, ''))
    .sort()

/**
 * Names that are the same in every language. If the English unit has one,
 * its translation must have it too — a processor silently dropped from the
 * German list is a disclosure the German reader never got.
 */
const PROPER_NOUNS: readonly string[] = [
  M.operator, M.productName, M.contactEmail, M.hostingRegion,
  'Supabase', 'Stripe', 'Cloudflare', 'Turnstile',
  'Global Privacy Control', 'Do Not Track', 'localStorage', 'HTTPS',
]

/**
 * Words that occur in English prose and in none of the six other languages.
 * Deliberately short: "in", "a", "or", "no", "per" exist elsewhere too, and
 * "for" is Portuguese ("se for legal").
 */
const ENGLISH_WORDS = /\b(the|and|your|you|we|our|with|this|that|these|are|is|of|which|when|not)\b/gi

/** Names and terms of art a translation may legitimately keep in English. */
const KEPT_IN_ENGLISH = [...PROPER_NOUNS, 'row-level security', 'Row-Level Security', 'bet spread', 'Bet Spread']

function englishWordsIn(text: string): string[] {
  let stripped = text
  for (const keep of KEPT_IN_ENGLISH) stripped = stripped.split(keep).join(' ')
  return stripped.match(ENGLISH_WORDS) ?? []
}

/** The street, postcode and town of the operator — everything but the country. */
const STREET_AND_TOWN = M.operatorLocation.split(', ').slice(0, -1).join(', ')

/** How each language names the currency the prices are quoted in. */
const SWISS_FRANCS: Record<TranslatedLocale, string> = {
  de: 'Schweizer Franken',
  fr: 'francs suisses',
  it: 'franchi svizzeri',
  es: 'francos suizos',
  pt: 'francos suíços',
  tr: 'İsviçre frangı',
}

describe('the language map', () => {
  it('has a translation of both documents for every language but English', () => {
    for (const kind of KINDS) {
      for (const locale of TRANSLATED) {
        expect(isLegalTranslation(kind, locale), `${kind} · ${locale}`).toBe(true)
        expect(legalDoc(kind, locale), `${kind} · ${locale}`).not.toBe(legalDoc(kind, 'en'))
      }
    }
  })

  it('treats English as the original, not as a translation', () => {
    for (const kind of KINDS) expect(isLegalTranslation(kind, 'en')).toBe(false)
  })

  it('falls back to English for a language it does not have', () => {
    // A language added to the site before its legal text exists must show
    // the binding English document, not an empty page.
    const unknown = 'ja' as unknown as Locale
    for (const kind of KINDS) {
      expect(legalDoc(kind, unknown)).toBe(legalDoc(kind, 'en'))
      expect(isLegalTranslation(kind, unknown)).toBe(false)
    }
  })

  it('names the route of each document', () => {
    expect(legalPath('privacy')).toBe('/privacy')
    expect(legalPath('terms')).toBe('/terms')
  })
})

describe.each(KINDS)('%s — every translation against the English', kind => {
  const english = legalDoc(kind, 'en')
  const englishUnits = units(english)

  describe.each(TRANSLATED)('%s', locale => {
    const doc = legalDoc(kind, locale)
    const docUnits = units(doc)

    it('has the same sections, and in each the same paragraphs and bullets', () => {
      expect(doc.sections).toHaveLength(english.sections.length)
      expect(shape(doc)).toEqual(shape(english))
    })

    it('numbers its sections 1..n like the English', () => {
      const number = (heading: string) => /^(\d+)\. \S/.exec(heading)?.[1]
      expect(doc.sections.map(s => number(s.heading))).toEqual(english.sections.map(s => number(s.heading)))
    })

    it('carries every e-mail address, URL, number and amount of each English block', () => {
      expect(docUnits).toHaveLength(englishUnits.length)
      docUnits.forEach((unit, i) => {
        const source = englishUnits[i]
        const where = `${kind} · ${locale} · ${unit.where}`
        expect(emails(unit.text), `e-mail in ${where}`).toEqual(emails(source.text))
        expect(urls(unit.text), `URL in ${where}`).toEqual(urls(source.text))
        expect(numbers(unit.text), `numbers in ${where}`).toEqual(numbers(source.text))
        expect(amounts(unit.text), `amounts in ${where}`).toEqual(amounts(source.text))
      })
    })

    it('names the operator, the product and every processor where the English does', () => {
      docUnits.forEach((unit, i) => {
        for (const noun of PROPER_NOUNS) {
          if (!englishUnits[i].text.includes(noun)) continue
          expect(unit.text, `"${noun}" in ${kind} · ${locale} · ${unit.where}`).toContain(noun)
        }
        // "Pro" is a word of its own in every language; a substring test
        // would be satisfied by "Protección".
        if (/\bPro\b/.test(englishUnits[i].text)) {
          expect(unit.text, `"Pro" in ${kind} · ${locale} · ${unit.where}`).toMatch(/(^|[^\p{L}])Pro(?!\p{L})/u)
        }
      })
    })

    it('gives the operator’s address where the English does, with the country translated', () => {
      docUnits.forEach((unit, i) => {
        if (!englishUnits[i].text.includes(M.operatorLocation)) return
        expect(unit.text, `${kind} · ${locale} · ${unit.where}`).toContain(legalLocation(locale))
        expect(unit.text).toContain(STREET_AND_TOWN)
      })
    })

    it('leaves no block in English', () => {
      docUnits.forEach((unit, i) => {
        const where = `${kind} · ${locale} · ${unit.where}`
        // Byte-identical to the source is only right for a bare name or a
        // one-word heading ("Contact" is French too).
        const bare = KEPT_IN_ENGLISH.reduce((t, keep) => t.split(keep).join(''), unit.text).replace(/[\d\s\p{P}]/gu, '')
        const oneWordHeading = unit.heading && unit.text.replace(/^\d+\.\s/, '').trim().split(/\s+/).length === 1
        if (bare.length > 0 && !oneWordHeading) {
          expect(unit.text, `untranslated: ${where}`).not.toBe(englishUnits[i].text)
        }
        expect(englishWordsIn(unit.text), `English words in ${where}`).toEqual([])
      })
    })

    it('leaves no empty block', () => {
      for (const unit of docUnits) expect(unit.text.trim().length, `${kind} · ${locale} · ${unit.where}`).toBeGreaterThan(0)
    })

    it('states the last-updated date in its own format, in the intro', () => {
      expect(doc.intro).toContain(legalDate(locale))
    })

    it('is titled as the site’s own link to it is labelled', () => {
      // The footer says "Datenschutzerklärung"; the page it opens must not
      // be headed something else.
      expect(doc.title).toBe(MESSAGES[locale].contact[kind])
    })
  })
})

describe.each(TRANSLATED)('wording the app fixes — %s', locale => {
  const privacy = units(legalDoc('privacy', locale)).map(u => u.text).join('\n')
  const terms = legalDoc('terms', locale)

  it('quotes the consent bar’s buttons exactly as the bar labels them', () => {
    // The policy tells the reader to choose "Accept" and where to find
    // "Cookie settings". If the translation invents its own label, it sends
    // them looking for a button that is not on the page.
    const { accept, decline, settings } = MESSAGES[locale].consent
    for (const label of [accept, decline, settings]) expect(privacy).toContain(label)
  })

  it('calls the bankroll tracker what the app calls it', () => {
    expect(privacy.toLowerCase()).toContain(MESSAGES[locale].modes.bankrollTracker.toLowerCase())
  })

  it('names the governing law from legal-meta, in the governing-law clause', () => {
    const english = legalDoc('terms', 'en')
    const index = english.sections.findIndex(s => s.blocks.some(b => typeof b === 'string' && b.includes(`laws of ${M.governingLaw}`)))
    expect(index).toBeGreaterThanOrEqual(0)
    expect(terms.sections[index].blocks.join(' ')).toContain(legalGoverningLaw(locale))
  })

  it('quotes prices in Swiss francs where the English does', () => {
    const english = units(legalDoc('terms', 'en'))
    const translated = units(terms)
    const index = english.findIndex(u => u.text.includes('Swiss francs'))
    expect(index).toBeGreaterThanOrEqual(0)
    expect(translated[index].text).toContain(SWISS_FRANCS[locale])
  })
})

describe('German', () => {
  it('uses Swiss spelling — no ß — like the instruction for the German UI', () => {
    for (const kind of KINDS) {
      for (const unit of units(legalDoc(kind, 'de'))) expect(unit.text, `${kind} · ${unit.where}`).not.toContain('ß')
    }
    const n = TRANSLATION_NOTICE.de
    expect(n.before + n.link + n.after).not.toContain('ß')
  })
})

describe('the translation notice', () => {
  it('exists for each of the six translated languages and not for English', () => {
    expect(Object.keys(TRANSLATION_NOTICE).sort()).toEqual([...TRANSLATED].sort())
    expect(TRANSLATION_NOTICE).not.toHaveProperty('en')
  })

  it.each(TRANSLATED)('%s: is a sentence in that language with a link in the middle of it', locale => {
    const n = TRANSLATION_NOTICE[locale]
    expect(n.before.trim().length).toBeGreaterThan(20)
    expect(n.link.trim().length).toBeGreaterThan(3)
    expect(n.after.trim().length).toBeGreaterThan(0)
    expect(englishWordsIn(n.before + n.link + n.after)).toEqual([])
  })

  it('is worded differently in every language', () => {
    const texts = TRANSLATED.map(l => TRANSLATION_NOTICE[l].before + TRANSLATION_NOTICE[l].link + TRANSLATION_NOTICE[l].after)
    expect(new Set(texts).size).toBe(TRANSLATED.length)
  })
})

describe('the last-updated date', () => {
  it('comes from one ISO date in legal-meta', () => {
    expect(M.lastUpdatedIso).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(M.lastUpdated).toBe(formatLegalDate('en-GB', M.lastUpdatedIso))
    for (const locale of LOCALES) {
      expect(legalDate(locale)).toBe(formatLegalDate(LEGAL_LOCALE_TAGS[locale], M.lastUpdatedIso))
    }
  })

  it('is written the way each language writes a date', () => {
    // A fixed day, so the expectation does not move when the documents do.
    const on = (locale: Locale) => formatLegalDate(LEGAL_LOCALE_TAGS[locale], '2026-11-18')
    expect(on('en')).toBe('18 November 2026')
    expect(on('de')).toBe('18. November 2026')
    expect(on('fr')).toBe('18 novembre 2026')
    expect(on('it')).toBe('18 novembre 2026')
    expect(on('es')).toBe('18 de noviembre de 2026')
    expect(on('pt')).toBe('18 de novembro de 2026')
    expect(on('tr')).toBe('18 Kasım 2026')
  })

  it('does not slip a day at either end of the month', () => {
    expect(formatLegalDate('en-GB', '2026-01-01')).toBe('1 January 2026')
    expect(formatLegalDate('en-GB', '2026-12-31')).toBe('31 December 2026')
  })

  it('keeps the English documents on the English date', () => {
    for (const kind of KINDS) expect(legalDoc(kind, 'en').intro).toContain(M.lastUpdated)
  })
})
