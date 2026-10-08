import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import i18n from 'i18next'
import { setLocale } from '../../i18n'
import { buildAccountReport, reportFileName, RECENT_LIMIT, type AccountReportInput } from './account-report'
import type { TrainingSessionResult } from '../stats-types'
import type { TrackedCasinoSession } from '../../store/casino-session-tracker-store'
import type { TrackedSession } from '../../store/bankroll-tracker-store'

/**
 * The account overview a person reads (PDF, Word, Excel). Checked through the
 * real translations, because a missing key would print as `report.label.xp`
 * on paper — exactly the "code nobody wants to read" this replaces.
 */
const NOW = new Date('2026-10-08T15:00:00Z')

const session = (i: number, over: Partial<TrainingSessionResult> = {}): TrainingSessionResult => ({
  id: `s${i}`, mode: 'speedDrill', timestamp: new Date(Date.UTC(2026, 9, 1, 10, i)).toISOString(),
  countingSystem: 'HiLo' as TrainingSessionResult['countingSystem'], durationSeconds: 300, totalQuestions: 10,
  correctAnswers: 8, accuracy: 0.8, bestStreak: 4,
  details: { type: 'speedDrill', cardsPerRound: 10, speedMs: 800, rcErrors: [] }, ...over,
})
const casino: TrackedCasinoSession = {
  id: 'c1', date: '2026-10-08', timestamp: Date.UTC(2026, 9, 8, 13, 0), handsPlayed: 25, duration: 900,
  startingBankroll: 5000, finalBankroll: 5060, profit: 60, betAccuracy: 90, playAccuracy: 95, countAccuracy: 80,
  overallScore: 88, grade: 'B+', numBots: 2, config: { numDecks: 6, minBet: 25, blackjackPays: 1.5 },
}
const realMoney: TrackedSession = { id: 'b1', date: '2026-09-20', casino: 'Baden', result: -150, hoursPlayed: 2.5, notes: '', createdAt: 0 }

function input(over: Partial<AccountReportInput> = {}): AccountReportInput {
  return {
    email: 'ada@example.com', totalXP: 1665,
    unlocked: [{ achievementId: 'first_hand', unlockedAt: Date.UTC(2026, 8, 1) }], totalAchievements: 102,
    sessions: [session(1), session(2, { mode: 'casinoSession', accuracy: 0.6, correctAnswers: 6 })],
    casinoSessions: [casino], bankroll: [realMoney], now: NOW, locale: 'en',
    t: (k, o) => i18n.t(k, o) as string, ...over,
  }
}

const allText = (r: ReturnType<typeof buildAccountReport>) => JSON.stringify(r)

describe('buildAccountReport', () => {
  beforeAll(async () => { await setLocale('en') })
  afterAll(async () => { await setLocale('en') })

  it('has every section, in reading order', () => {
    const r = buildAccountReport(input())
    expect(r.sections.map(s => s.id)).toEqual(['profile', 'training', 'byMode', 'casino', 'recent', 'achievements', 'bankroll', 'about'])
  })

  it('leaves no untranslated key on the page', () => {
    const r = buildAccountReport(input())
    // A key looks like `report.label.xp`: a namespace, a dot, a letter.
    expect(allText(r)).not.toMatch(/\b(report|account|modes|ach|levels)\.[a-zA-Z_]/)
  })

  it('shows level, XP and the way to the next level in words', () => {
    const profile = buildAccountReport(input()).sections[0]
    const v = Object.fromEntries(profile.facts!.map(f => [f.label, f.value]))
    expect(v['E-mail']).toBe('ada@example.com')
    expect(v['Total XP']).toBe('1,665')
    expect(v['Level']).toMatch(/^Level \d+ — /)
    expect(v['Next level']).toMatch(/XP to level \d+/)
    expect(v['Achievements']).toBe('1 of 102')
  })

  it('formats money, percentages and durations for the reader’s language', async () => {
    let r = buildAccountReport(input())
    expect(allText(r)).toContain('+$60')
    expect(allText(r)).toContain('-$150')
    expect(allText(r)).toContain('70%')                // 14 of 20 questions overall
    expect(allText(r)).toContain('10 min')            // two 5-minute sessions
    await setLocale('de')
    r = buildAccountReport(input({ locale: 'de' }))
    expect(r.title).toBe('Dein Blackjack-Trainer-Konto')
    expect(allText(r)).toContain('1.665')
    expect(allText(r)).toMatch(/\+60\s?\$/)
    expect(allText(r)).toContain('10 Min.')
    await setLocale('en')
  })

  it('lists the casino sessions and the real-money log with their totals', () => {
    const r = buildAccountReport(input())
    const c = r.sections.find(s => s.id === 'casino')!
    expect(c.table!.rows).toHaveLength(1)
    expect(c.table!.rows[0]).toContain('B+ (88)')
    const b = r.sections.find(s => s.id === 'bankroll')!
    expect(b.table!.rows[0]).toContain('Baden')
  })

  it('says so, plainly, where there is nothing yet', () => {
    const r = buildAccountReport(input({ sessions: [], casinoSessions: [], bankroll: [], unlocked: [] }))
    expect(r.sections.find(s => s.id === 'casino')!.empty).toBe('No casino sessions yet.')
    expect(r.sections.find(s => s.id === 'achievements')!.empty).toBe('No achievements unlocked yet.')
    expect(r.sections.find(s => s.id === 'byMode')!.empty).toBe('No training sessions yet.')
  })

  it('keeps the recent list to the last sessions, newest first', () => {
    const many = Array.from({ length: RECENT_LIMIT + 10 }, (_, i) => session(i))
    const recent = buildAccountReport(input({ sessions: many })).sections.find(s => s.id === 'recent')!
    expect(recent.table!.rows).toHaveLength(RECENT_LIMIT)
    expect(recent.title).toBe(`Last ${RECENT_LIMIT} sessions`)
  })
})

describe('reportFileName', () => {
  it('is dated and carries the format', () => {
    expect(reportFileName(NOW, 'pdf')).toBe('blackjack-trainer-account-2026-10-08.pdf')
    expect(reportFileName(NOW, 'xlsx')).toBe('blackjack-trainer-account-2026-10-08.xlsx')
  })
})
