import { describe, it, expect } from 'vitest'
import {
  PLAN_OPTIONS,
  PRO_BENEFITS,
  FREE_BENEFITS,
  FEATURE_GROUPS,
  formatCHF,
  yearlySaving,
  VAT_NOTE,
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
    expect(s.monthlyTotal).toBeCloseTo(94.8, 2) // 7.90 x 12
    expect(s.saved).toBeCloseTo(35.8, 2)        // 94.80 - 59
    expect(s.percent).toBe(38)
  })

  it('tracks a price change instead of going stale', () => {
    const plans: PlanOption[] = [
      { id: 'monthly', label: 'Monthly', amount: 10, cadence: '/month' },
      { id: 'yearly', label: 'Yearly', amount: 60, cadence: '/year' },
    ]
    const s = yearlySaving(plans)
    expect(s.monthlyTotal).toBe(120)
    expect(s.saved).toBe(60)
    expect(s.percent).toBe(50)
  })

  it('throws rather than rendering NaN at a customer when a plan is missing', () => {
    const onlyMonthly: PlanOption[] = [
      { id: 'monthly', label: 'Monthly', amount: 7.9, cadence: '/month' },
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
  it('groups every capability under a titled section', () => {
    expect(FEATURE_GROUPS.length).toBeGreaterThan(1)
    for (const g of FEATURE_GROUPS) {
      expect(g.title.trim().length).toBeGreaterThan(0)
      expect(g.rows.length).toBeGreaterThan(0)
      for (const r of g.rows) expect(r.label.trim().length).toBeGreaterThan(0)
    }
  })

  it('never lists the same capability twice', () => {
    const labels = FEATURE_GROUPS.flatMap(g => g.rows).map(r => r.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('gives every partial row the qualifier it needs', () => {
    // A "partial" tick without a note would read as full access.
    for (const r of FEATURE_GROUPS.flatMap(g => g.rows)) {
      if (r.free === 'partial') expect(r.freeNote?.trim()).toBeTruthy()
    }
  })

  it('offers something real in the free tier and something real behind Pro', () => {
    const rows = FEATURE_GROUPS.flatMap(g => g.rows)
    expect(rows.some(r => r.free === 'full')).toBe(true)
    expect(rows.some(r => r.free === 'none')).toBe(true)
  })
})

describe('derived benefit lists', () => {
  it('derives Pro benefits from the groups, so the two cannot disagree', () => {
    const notFullyFree = FEATURE_GROUPS.flatMap(g => g.rows).filter(r => r.free !== 'full')
    expect(PRO_BENEFITS).toHaveLength(notFullyFree.length)
    for (const r of notFullyFree) expect(PRO_BENEFITS).toContain(r.label)
  })

  it('counts a partial capability towards both tiers', () => {
    // Free has the basics, Pro completes it — it belongs in both lists.
    const partial = FEATURE_GROUPS.flatMap(g => g.rows).find(r => r.free === 'partial')
    expect(partial, 'expected at least one partial row').toBeTruthy()
    expect(PRO_BENEFITS).toContain(partial!.label)
    expect(FREE_BENEFITS.some(b => b.startsWith(partial!.label))).toBe(true)
  })

  it('keeps fully-paid capabilities out of the free list', () => {
    const paidOnly = FEATURE_GROUPS.flatMap(g => g.rows).filter(r => r.free === 'none')
    for (const r of paidOnly) {
      expect(FREE_BENEFITS.some(b => b.startsWith(r.label))).toBe(false)
    }
  })
})

describe('benefit lists', () => {
  it('describes both tiers without empty entries', () => {
    for (const list of [PRO_BENEFITS, FREE_BENEFITS]) {
      expect(list.length).toBeGreaterThan(0)
      for (const entry of list) expect(entry.trim().length).toBeGreaterThan(0)
    }
  })

  it('keeps the paid modes out of the free tier list', () => {
    const free = FREE_BENEFITS.join(' ').toLowerCase()
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
  it('names the rate, so the note and the Stripe tax rate cannot drift apart silently', () => {
    expect(VAT_NOTE).toContain(String(CH_VAT_PERCENT))
  })

  it('says the displayed amount is what gets charged', () => {
    expect(VAT_NOTE.toLowerCase()).toContain('final price')
  })

  it('scopes the VAT to Switzerland rather than claiming it applies to everyone', () => {
    // The note is shown to every visitor — detecting the country in the browser
    // is wrong for anyone travelling or on a VPN. So it has to be a sentence
    // that stays true no matter who reads it.
    expect(VAT_NOTE).toMatch(/Switzerland/)
  })

  it('uses the current Swiss rate', () => {
    expect(CH_VAT_PERCENT).toBe(8.1)
  })
})
