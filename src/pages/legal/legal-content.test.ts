import { describe, it, expect } from 'vitest'
import { PRIVACY_DOC } from './privacy-content'
import { TERMS_DOC } from './terms-content'
import { hasUnsetPlaceholders, LEGAL_META } from './legal-meta'
import type { LegalDoc } from './legal-types'

/** Flatten a document's prose into one lowercase string for topic checks. */
function text(doc: LegalDoc): string {
  const blocks = doc.sections.flatMap(s =>
    s.blocks.flatMap(b => (typeof b === 'string' ? [b] : b.list)),
  )
  return [doc.intro, ...blocks].join(' ').toLowerCase()
}

describe('legal documents — structure', () => {
  for (const [name, doc] of [['Privacy', PRIVACY_DOC], ['Terms', TERMS_DOC]] as const) {
    it(`${name}: every section has a heading and at least one block`, () => {
      expect(doc.sections.length).toBeGreaterThan(5)
      for (const s of doc.sections) {
        expect(s.heading.trim().length).toBeGreaterThan(0)
        expect(s.blocks.length).toBeGreaterThan(0)
      }
    })

    it(`${name}: sections are numbered 1..n with no gap and no repeat`, () => {
      // The numbers are written into the headings by hand, so inserting a
      // section means renumbering every one after it. Miss one and the
      // document has two clause 7s — which matters the day someone cites one.
      const numbers = doc.sections.map(s => {
        const m = /^(\d+)\./.exec(s.heading)
        expect(m, `unnumbered heading: "${s.heading}"`).not.toBeNull()
        return Number(m![1])
      })
      expect(numbers).toEqual(numbers.map((_, i) => i + 1))
    })
  }
})

describe('Privacy Policy — required topics', () => {
  const t = text(PRIVACY_DOC)
  // These reflect what the app actually does; dropping any is a compliance gap.
  it.each([
    ['data-subject rights', /access|correct|delete|export/],
    ['the governing laws', /revdsg|gdpr/],
    ['Stripe as payment processor', /stripe/],
    ['Supabase as host', /supabase/],
    ['the bankroll / money data it stores', /bankroll|profit|money amounts/],
    ['no card number stored', /card number/],
    ['no ad tracking', /advertising|tracking/],
    ['retention / deletion', /delete your account|as long as your account/],
  ])('mentions %s', (_label, re) => {
    expect(t).toMatch(re)
  })
})

describe('Terms of Use — required topics', () => {
  const t = text(TERMS_DOC)
  it.each([
    ['that it is not gambling', /not gambling/],
    ['simulated play', /simulated/],
    ['the minimum age', new RegExp(String(LEGAL_META.minimumAge))],
    ['subscription auto-renewal', /renew/],
    ['cancellation', /cancel/],
    ['no financial advice', /not financial|not .*advice/],
    ['responsible gambling', /responsibl/],
    ['governing law', /governed by/],
    // The operator is a Swiss company selling to consumers, so the listed
    // amounts have to be all-in and the Terms have to say so.
    ['that the listed prices are final', /final price/],
    ['that Swiss VAT is included', /value added tax|vat/],
    ['where the VAT is shown', /invoice|receipt/],
  ])('states %s', (_label, re) => {
    expect(t).toMatch(re)
  })

  it('gives the VAT statement a heading of its own', () => {
    // A tax authority asking "where do you declare that your prices are gross?"
    // has to be answerable with a clause number. Buried in the subscription
    // paragraph, the sentence exists but cannot be pointed at.
    const vatSection = TERMS_DOC.sections.find(s => /vat/i.test(s.heading))
    expect(vatSection, 'no section heading mentions VAT').toBeDefined()
    expect(vatSection!.heading).toMatch(/price/i)
  })

  it('scopes the included VAT to customers in Switzerland', () => {
    const vatSection = TERMS_DOC.sections.find(s => /vat/i.test(s.heading))!
    const prose = vatSection.blocks
      .flatMap(b => (typeof b === 'string' ? [b] : b.list))
      .join(' ')
    expect(prose).toMatch(/customers in Switzerland/i)
    // Consumer pricing: inclusive, never exclusive. Saying so explicitly is the
    // difference between a policy and an assumption.
    expect(prose.toLowerCase()).toContain('inclusive of vat')
  })
})

describe('legal-meta placeholders', () => {
  // Test the detector directly, independent of whether the shipped meta happens
  // to be filled in — it drives the "not yet published" banner.
  it('flags an object that still holds a [SET: …] placeholder', () => {
    expect(hasUnsetPlaceholders({ operator: 'Acme GmbH', contactEmail: '[SET: e.g. x@y.z]' })).toBe(true)
  })

  it('passes an object with every field filled', () => {
    expect(hasUnsetPlaceholders({ operator: 'Acme GmbH', contactEmail: 'x@y.z' })).toBe(false)
  })

  it('the shipped meta has no leftover placeholders', () => {
    // Guards against a real value being reverted to a "[SET: …]" stub.
    expect(hasUnsetPlaceholders(LEGAL_META)).toBe(false)
  })
})
