import { describe, it, expect } from 'vitest'
import { PAYWALL_SUBJECTS, paywallSubject, subjectForLine, subjectForMode } from './paywall-subject'
import type { PaywallLine } from './paywall-line'

/**
 * Which picture the paywall opens with. The rule is "what this visitor
 * reached for": a locked screen names itself, the personal line names a
 * stage, and with neither the table stands in for all of Pro.
 */
describe('paywallSubject', () => {
  it('lists the three in the order the paywall shows them', () => {
    expect(PAYWALL_SUBJECTS).toEqual(['table', 'deviations', 'drills'])
  })

  it('maps the locked screens to their picture', () => {
    expect(subjectForMode('casinoSession')).toBe('table')
    expect(subjectForMode('betSpread')).toBe('drills')
    expect(subjectForMode('deckEstimation')).toBe('drills')
    expect(subjectForMode('strategyChart')).toBe('deviations')
  })

  it('has no picture for screens that are not about one of the three', () => {
    // The bankroll tools are Pro but not among the three; the plan decides.
    expect(subjectForMode('bankrollSim')).toBeNull()
    expect(subjectForMode('casinoSessionTracker')).toBeNull()
    expect(subjectForMode('home')).toBeNull()
    expect(subjectForMode(null)).toBeNull()
  })

  it('reads the Pro stage the personal line names', () => {
    const next: PaywallLine = {
      lead: { key: 'paywall.personalFinished', stageTitleKey: 'curriculum.deviations.title' },
      support: { key: 'paywall.personalNextIsPro', stageTitleKey: 'curriculum.bet-spread.title' },
    }
    expect(subjectForLine(next)).toBe('drills')

    // "Your plan is at True count. Practising it is part of Pro." — the stage is in the lead.
    const here: PaywallLine = {
      lead: { key: 'paywall.personalAt', stageTitleKey: 'curriculum.true-count.title' },
      support: { key: 'paywall.personalThisIsPro' },
    }
    expect(subjectForLine(here)).toBe('drills')

    const table: PaywallLine = {
      lead: { key: 'paywall.personalAt', stageTitleKey: 'curriculum.bet-spread.title' },
      support: { key: 'paywall.personalLaterIsPro', stageTitleKey: 'curriculum.table.title' },
    }
    expect(subjectForLine(table)).toBe('table')
  })

  it('finds nothing in the trial line, which names no stage', () => {
    expect(subjectForLine({
      lead: { key: 'paywall.trialLead', values: { count: 10, pct: 86 } },
      support: { key: 'paywall.trialSupport' },
    })).toBeNull()
    expect(subjectForLine(null)).toBeNull()
  })

  it('takes the strongest signal first', () => {
    const line: PaywallLine = {
      lead: { key: 'paywall.personalAt', stageTitleKey: 'curriculum.true-count.title' },
      support: { key: 'paywall.personalThisIsPro' },
    }
    expect(paywallSubject({ explicit: 'deviations', atTable: true, mode: 'betSpread', line })).toBe('deviations')
    expect(paywallSubject({ atTable: true, mode: 'betSpread', line })).toBe('table')
    expect(paywallSubject({ mode: 'strategyChart', line })).toBe('deviations')
    expect(paywallSubject({ mode: 'home', line })).toBe('drills')
  })

  it('falls back to the table when nothing points anywhere', () => {
    expect(paywallSubject({})).toBe('table')
    expect(paywallSubject({ mode: 'bankrollSim', line: null })).toBe('table')
  })
})
