import en from '../i18n/messages/en.json'
import { describe, it, expect } from 'vitest'
import {
  PLAN_OPTIONS,
  PRO_BENEFITS,
  FREE_BENEFITS,
  FEATURE_GROUPS,
  formatCHF,
  yearlySaving,
  CH_VAT_PERCENT,
  isProMode,
  type PlanOption,
} from './pro-features'

describe('formatCHF', () => {
  it('drops the decimals on whole francs', () => {
    expect(formatCHF(59)).toBe('CHF 59')
  })

  it('keeps two decimals when there are centimes', () => {
    expect(formatCHF(7.9)).toBe('CHF 7.90')
    expect(formatCHF(35.8)).toBe('CHF 35.80')
  })

  it('formats zero as a whole amount', () => {
    expect(formatCHF(0)).toBe('CHF 0')
  })
})

describe('yearlySaving', () => {
  it('derives the real discount from the configured amounts', () => {
    // The copy used to claim "2 months free" while the actual discount was
    // ~4.5 months. Deriving it means the claim cannot drift from the price again.
    const s = yearlySaving()
    expect(s.monthlyTotal).toBeCloseTo(106.8, 2) // 8.90 x 12
    expect(s.saved).toBeCloseTo(37.8, 2)         // 106.80 - 69
    expect(s.percent).toBe(35)
  })

  it('matches the amounts Stripe actually charges', () => {
    // These two numbers exist twice: here, and as live Stripe Prices. Nothing
    // reconciles them automatically, and the failure is silent — the page would
    // advertise one figure while the card is charged another. Changing a price
    // in Stripe means changing it here, and this test is the reminder.
    const monthly = PLAN_OPTIONS.find(p => p.id === 'monthly')!
    const yearly = PLAN_OPTIONS.find(p => p.id === 'yearly')!
    expect(monthly.amount).toBe(8.9)
    expect(yearly.amount).toBe(69)
  })

  it('tracks a price change instead of going stale', () => {
    const plans: PlanOption[] = [
      { id: 'monthly', amount: 10, cadence: '/month' },
      { id: 'yearly', amount: 60, cadence: '/year' },
    ]
    const s = yearlySaving(plans)
    expect(s.monthlyTotal).toBe(120)
    expect(s.saved).toBe(60)
    expect(s.percent).toBe(50)
  })

  it('throws rather than rendering NaN at a customer when a plan is missing', () => {
    const onlyMonthly: PlanOption[] = [
      { id: 'monthly', amount: 7.9, cadence: '/month' },
    ]
    expect(() => yearlySaving(onlyMonthly)).toThrow(/monthly and a yearly/)
  })
})

describe('PLAN_OPTIONS', () => {
  it('offers exactly one monthly and one yearly plan', () => {
    expect(PLAN_OPTIONS.filter(p => p.id === 'monthly')).toHaveLength(1)
    expect(PLAN_OPTIONS.filter(p => p.id === 'yearly')).toHaveLength(1)
  })

  it('prices yearly below twelve months of monthly — otherwise the pitch is a lie', () => {
    const { saved } = yearlySaving()
    expect(saved).toBeGreaterThan(0)
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
