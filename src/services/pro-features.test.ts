import en from '../i18n/messages/en.json'
import { describe, it, expect } from 'vitest'
import {
  PLAN_IDS,
  PRO_BENEFITS,
  FREE_BENEFITS,
  FEATURE_GROUPS,
  formatMoney,
  formatDecimal,
  yearlySaving,
  CH_VAT_PERCENT,
  isProMode,
} from './pro-features'

describe('formatMoney', () => {
  /**
   * Collapse the space `Intl` puts between the currency and the number.
   *
   * It is a non-breaking one \u2014 U+00A0 today, U+202F in some ICU versions \u2014 and
   * that is the correct character: it stops "CHF" and "69" landing on
   * different lines. Asserting on the exact code point would make these tests
   * fail on a Node upgrade that changed nothing anyone can see.
   */
  const flat = (s: string) => s.replace(/[\u00A0\u202F]/g, ' ')

  it('drops the decimals on a whole amount', () => {
    // "CHF 69.00" reads like a form field. "CHF 69" reads like a price.
    expect(flat(formatMoney(6900, 'chf', 'en'))).toBe('CHF 69')
  })

  it('keeps them when there are centimes', () => {
    expect(flat(formatMoney(890, 'chf', 'en'))).toBe('CHF 8.90')
    expect(flat(formatMoney(3580, 'chf', 'en'))).toBe('CHF 35.80')
  })

  it('formats zero as a whole amount, for the free tier', () => {
    expect(flat(formatMoney(0, 'chf', 'en'))).toBe('CHF 0')
  })

  it('does not inflate a zero-decimal currency a hundredfold', () => {
    // Stripe's unit_amount is the currency's SMALLEST unit, and for JPY that
    // is the yen itself. Dividing by a hard-coded 100 would price a 1,000 yen
    // plan at 10 yen \u2014 the kind of error that only shows up in the one market
    // nobody tested in.
    expect(flat(formatMoney(1000, 'jpy', 'en'))).toBe('\u00A51,000')
  })

  it('keeps the price unbreakable across a line end', () => {
    // The reason the assertions above have to normalise at all. A price that
    // wraps between the currency and the figure is the one typographic detail
    // people actually notice on a pricing card.
    expect(formatMoney(890, 'chf', 'en')).toMatch(/[\u00A0\u202F]/)
  })

  it('orders the amount the way the reader\u2019s language does', () => {
    // Same amount, same currency, different languages: English leads with the
    // code, German follows the number with it. A page that hard-codes one
    // order is translated rather than localised.
    const en = flat(formatMoney(890, 'chf', 'en'))
    const de = flat(formatMoney(890, 'chf', 'de'))
    expect(en).toMatch(/^CHF/)
    expect(de).toMatch(/CHF$/)
  })
})

describe("formatDecimal", () => {
  it("uses the reader’s decimal separator", () => {
    // The VAT rate arrives as the number 8.1 and used to be interpolated raw,
    // so a German sentence read "8.1%". A stray full stop in a sentence about
    // tax is a small thing that makes a page look translated rather than
    // written, in the worst possible place to look careless.
    expect(formatDecimal(8.1, "en")).toBe("8.1")
    expect(formatDecimal(8.1, "de")).toBe("8,1")
    expect(formatDecimal(8.1, "fr")).toBe("8,1")
  })

  it("leaves a whole number whole", () => {
    expect(formatDecimal(8, "de")).toBe("8")
  })
})

describe('yearlySaving', () => {
  it('derives the real discount from the two amounts', () => {
    // The copy used to claim "2 months free" while the actual discount was
    // ~4.5 months. Deriving it means the claim cannot drift from the price.
    const s = yearlySaving(890, 6900)
    expect(s.monthlyTotal).toBe(10680)
    expect(s.saved).toBe(3780)
    expect(s.percent).toBe(35)
  })

  it('follows a price change instead of going stale', () => {
    // The point of the whole rewrite: the amounts arrive from Stripe, so this
    // has to be right for whatever pair it is handed. It used to be checked
    // against two literals that a Stripe price change silently invalidated.
    const s = yearlySaving(1000, 6000)
    expect(s.monthlyTotal).toBe(12000)
    expect(s.saved).toBe(6000)
    expect(s.percent).toBe(50)
  })

  it('reports a yearly plan priced above twelve months as a negative saving', () => {
    // Not an error \u2014 a real, if unlikely, configuration. What matters is that
    // it comes out negative so the UI can decline to call it a saving, rather
    // than an absolute value that would advertise a markup as a discount.
    expect(yearlySaving(500, 9900).saved).toBeLessThan(0)
  })

  it('throws rather than rendering NaN at a customer', () => {
    // A zero monthly price makes the percentage NaN. Better a thrown error in
    // a test than "Save NaN%" on the paywall.
    expect(() => yearlySaving(0, 6900)).toThrow(/zero monthly price/)
  })
})

describe('PLAN_IDS', () => {
  it('offers exactly one monthly and one yearly plan', () => {
    expect([...PLAN_IDS].sort()).toEqual(['monthly', 'yearly'])
  })

  it('carries no amounts', () => {
    // The regression this guards. Amounts lived here as literals next to a
    // comment asking the next person to keep them in step with Stripe; on
    // 10 Aug 2026 they went out of step and the page advertised CHF 8.90 while
    // the configured price charged 7.90. A price in this module is a price
    // nothing reconciles \u2014 they come from Stripe now, via `plan-price-store`.
    for (const id of PLAN_IDS) expect(typeof id).toBe('string')
  })
})

describe('FEATURE_GROUPS', () => {
  /** English text for a key, so the tests read what a user reads. */
  const label = (k: string) => (en.paywall as Record<string, string>)[k]

  it('names every group and row with a key that actually resolves', () => {
    // A typo in a key does not throw — it renders the raw key path on the
    // paywall, which is the screen where confidence matters most.
    expect(FEATURE_GROUPS.length).toBeGreaterThan(1)
    for (const g of FEATURE_GROUPS) {
      expect(label(g.titleKey), `missing paywall.${g.titleKey}`).toBeTruthy()
      expect(g.rows.length).toBeGreaterThan(0)
      for (const r of g.rows) {
        expect(label(r.labelKey), `missing paywall.${r.labelKey}`).toBeTruthy()
      }
    }
  })

  it('never lists the same capability twice', () => {
    const keys = FEATURE_GROUPS.flatMap(g => g.rows).map(r => r.labelKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('gives every partial row the qualifier it needs', () => {
    // A "partial" tick without a note would read as full access.
    for (const r of FEATURE_GROUPS.flatMap(g => g.rows)) {
      if (r.free === 'partial') {
        expect(r.freeNoteKey).toBeTruthy()
        expect(label(r.freeNoteKey!)).toBeTruthy()
      }
    }
  })

  it('offers something real in the free tier and something real behind Pro', () => {
    const rows = FEATURE_GROUPS.flatMap(g => g.rows)
    expect(rows.some(r => r.free === 'full')).toBe(true)
    expect(rows.some(r => r.free === 'none')).toBe(true)
  })
})

describe('derived benefit lists', () => {
  const label = (k: string) => (en.paywall as Record<string, string>)[k]

  it('derives Pro benefits from the groups, so the two cannot disagree', () => {
    const notFullyFree = FEATURE_GROUPS.flatMap(g => g.rows).filter(r => r.free !== 'full')
    expect(PRO_BENEFITS).toHaveLength(notFullyFree.length)
    for (const r of notFullyFree) expect(PRO_BENEFITS).toContain(r.labelKey)
  })

  it('counts a partial capability towards both tiers', () => {
    // Free has the basics, Pro completes it — it belongs in both lists.
    const partial = FEATURE_GROUPS.flatMap(g => g.rows).find(r => r.free === 'partial')
    expect(partial, 'expected at least one partial row').toBeTruthy()
    expect(PRO_BENEFITS).toContain(partial!.labelKey)
    expect(FREE_BENEFITS.map(r => r.labelKey)).toContain(partial!.labelKey)
  })

  it('keeps fully-paid capabilities out of the free list', () => {
    const paidOnly = FEATURE_GROUPS.flatMap(g => g.rows).filter(r => r.free === 'none')
    const freeKeys = FREE_BENEFITS.map(r => r.labelKey)
    for (const r of paidOnly) expect(freeKeys).not.toContain(r.labelKey)
  })

  it('keeps the paid modes out of the free tier, by name and not only by key', () => {
    // Checked against the English text, because the point is what a visitor
    // reads. A key-only check would pass even if `r4` said "Casino Session".
    const free = FREE_BENEFITS.map(r => label(r.labelKey)).join(' ').toLowerCase()
    expect(free).not.toContain('casino session')
    expect(free).not.toContain('bankroll')
    expect(free).not.toContain('deviations')
  })
})

describe('isProMode', () => {
  it('gates the paid modes', () => {
    for (const mode of ['casinoSession', 'betSpread', 'deckEstimation', 'bankrollSim'] as const) {
      expect(isProMode(mode)).toBe(true)
    }
  })

  it('leaves the free modes open', () => {
    for (const mode of ['home', 'speedDrill', 'deviationTraining', 'learn', 'achievements'] as const) {
      expect(isProMode(mode)).toBe(false)
    }
  })
})

/**
 * The operator is a Swiss company selling to consumers, so the amount on the
 * page has to be the amount charged, and the note has to say whose VAT it is.
 */
describe('the VAT note', () => {
  const note = en.pricing.vatNote

  it('carries the rate as a placeholder, so one constant feeds the sentence', () => {
    // The number lives in `CH_VAT_PERCENT` and is interpolated at render time.
    // Writing "8.1" into the translation would put the rate in eight places,
    // seven of which nobody checks when it changes.
    expect(note).toContain('{{rate}}')
    expect(CH_VAT_PERCENT).toBe(8.1)
  })

  it('says the displayed amount is what gets charged', () => {
    expect(note.toLowerCase()).toContain('final price')
  })

  it('scopes the VAT to Switzerland rather than claiming it applies to everyone', () => {
    // Shown to every visitor — detecting the country in the browser is wrong
    // for anyone travelling or on a VPN. So it has to be a sentence that stays
    // true no matter who reads it.
    expect(note).toMatch(/Switzerland/)
  })
})
