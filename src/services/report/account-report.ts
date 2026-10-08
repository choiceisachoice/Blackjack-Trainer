import type { TrainingSessionResult, TrainingMode } from '../stats-types'
import type { TrackedCasinoSession } from '../../store/casino-session-tracker-store'
import type { TrackedSession } from '../../store/bankroll-tracker-store'
import type { UnlockedAchievement } from '../achievements/achievement-types'
import { LEVELS } from '../level-system'

/** A label and its value, shown as a key-figure line. */
export interface ReportFact {
  label: string
  value: string
}

/** A table with a header row; every cell is already formatted text. */
export interface ReportTable {
  columns: string[]
  /** Which columns hold numbers and are right-aligned. */
  numeric: boolean[]
  rows: string[][]
}

/** One section of the report: a heading, key figures and/or a table. */
export interface ReportSection {
  id: 'profile' | 'training' | 'byMode' | 'casino' | 'recent' | 'achievements' | 'bankroll' | 'about'
  title: string
  facts?: ReportFact[]
  table?: ReportTable
  /** Shown instead of the table when there is nothing to list. */
  empty?: string
  /** A paragraph of plain text. */
  text?: string
}

/**
 * The account overview, ready to be drawn.
 *
 * Every string is translated and every number formatted here, once, so the
 * PDF, the Word file and the workbook cannot disagree: they only lay out what
 * this holds. The raw export (`data-export.ts`) stays the machine-readable
 * record the data-portability right asks for; this is the one a person reads.
 */
export interface AccountReport {
  title: string
  subtitle: string
  generated: string
  brand: string
  sections: ReportSection[]
}

/** What the report is built from — the stores' contents, passed in so it can be tested. */
export interface AccountReportInput {
  email: string | null
  totalXP: number
  unlocked: UnlockedAchievement[]
  totalAchievements: number
  sessions: TrainingSessionResult[]
  casinoSessions: TrackedCasinoSession[]
  bankroll: TrackedSession[]
  now: Date
  locale: string
  t: (key: string, options?: Record<string, unknown>) => string
}

const MODE_KEY: Record<TrainingMode, string> = {
  speedDrill: 'modes.speedDrill',
  deviationFlashCards: 'modes.deviationFlashCards',
  betSpread: 'modes.betSpread',
  deckEstimation: 'modes.deckEstimation',
  casinoSession: 'modes.casinoSession',
  tableCounting: 'modes.tableCounting',
  deviationAtTable: 'modes.deviationTable',
}

/** Rows in the "recent sessions" table; the full history is in the JSON export. */
export const RECENT_LIMIT = 25

/**
 * Build the account overview. Pure.
 *
 * @param input - The person's data, the time, the language and a translator
 * @returns The report, every value formatted for `input.locale`
 */
export function buildAccountReport(input: AccountReportInput): AccountReport {
  const { t, locale, now } = input
  const num = (n: number, digits = 0) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n)
  const pct = (ratio: number) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(ratio)
  const money = (n: number, signed = false) => {
    const s = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
    return signed && n > 0 ? `+${s}` : s
  }
  const date = (d: Date | number | string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(d))
  const dateTime = (d: Date | number | string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d))
  const duration = (seconds: number) => {
    const total = Math.max(0, Math.round(seconds / 60))
    if (total < 60) return t('report.durationMinutes', { m: total })
    return t('report.duration', { h: Math.floor(total / 60), m: String(total % 60).padStart(2, '0') })
  }
  // An achievement the catalogue no longer names (renamed, retired) shows its
  // id rather than a message key.
  const achText = (id: string, part: 'name' | 'desc') => {
    const key = `ach.${id}.${part}`
    const text = t(key)
    return text === key ? (part === 'name' ? id : '') : text
  }
  const mode = (m: TrainingMode) => (MODE_KEY[m] ? t(MODE_KEY[m]) : m)
  const dash = '—'

  // ── Level ──
  const level = [...LEVELS].reverse().find(l => input.totalXP >= l.xpRequired) ?? LEVELS[0]
  const next = LEVELS.find(l => l.level === level.level + 1)
  const sessionsByTime = [...input.sessions].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const first = sessionsByTime[0]

  const profile: ReportSection = {
    id: 'profile',
    title: t('report.section.profile'),
    facts: [
      { label: t('report.label.email'), value: input.email ?? dash },
      { label: t('report.label.level'), value: t('report.levelValue', { level: level.level, title: t(level.titleKey) }) },
      { label: t('report.label.xp'), value: num(input.totalXP) },
      {
        label: t('report.label.nextLevel'),
        value: next ? t('report.nextLevelValue', { xp: num(next.xpRequired - input.totalXP), level: next.level }) : t('report.maxLevel'),
      },
      { label: t('report.label.achievements'), value: t('report.ofTotal', { count: num(input.unlocked.length), total: num(input.totalAchievements) }) },
      { label: t('report.label.firstSession'), value: first ? date(first.timestamp) : dash },
    ],
  }

  // ── Training totals and per mode ──
  const totalQ = input.sessions.reduce((n, s) => n + s.totalQuestions, 0)
  const totalC = input.sessions.reduce((n, s) => n + s.correctAnswers, 0)
  const totalSec = input.sessions.reduce((n, s) => n + s.durationSeconds, 0)
  const days = new Set(input.sessions.map(s => s.timestamp.slice(0, 10)))
  const training: ReportSection = {
    id: 'training',
    title: t('report.section.training'),
    facts: [
      { label: t('report.label.sessions'), value: num(input.sessions.length) },
      { label: t('report.label.practiceTime'), value: duration(totalSec) },
      { label: t('report.label.accuracy'), value: totalQ > 0 ? pct(totalC / totalQ) : dash },
      { label: t('report.label.bestStreak'), value: num(input.sessions.reduce((m, s) => Math.max(m, s.bestStreak), 0)) },
      { label: t('report.label.activeDays'), value: num(days.size) },
    ],
  }

  const modes = new Map<TrainingMode, TrainingSessionResult[]>()
  for (const s of input.sessions) modes.set(s.mode, [...(modes.get(s.mode) ?? []), s])
  const modeRows = [...modes.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([m, list]) => {
      const q = list.reduce((n, s) => n + s.totalQuestions, 0)
      const c = list.reduce((n, s) => n + s.correctAnswers, 0)
      return [
        mode(m),
        num(list.length),
        q > 0 ? pct(c / q) : dash,
        pct(list.reduce((best, s) => Math.max(best, s.accuracy), 0)),
        duration(list.reduce((n, s) => n + s.durationSeconds, 0)),
      ]
    })
  const byMode: ReportSection = {
    id: 'byMode',
    title: t('report.section.byMode'),
    ...(modeRows.length > 0
      ? { table: {
        columns: [t('report.col.mode'), t('report.col.sessions'), t('report.col.accuracy'), t('report.col.best'), t('report.col.time')],
        numeric: [false, true, true, true, true],
        rows: modeRows,
      } }
      : { empty: t('report.empty.sessions') }),
  }

  // ── Casino sessions ──
  const casinoList = [...input.casinoSessions].sort((a, b) => b.timestamp - a.timestamp)
  const casinoNet = casinoList.reduce((n, s) => n + s.profit, 0)
  const casinoHands = casinoList.reduce((n, s) => n + s.handsPlayed, 0)
  const casino: ReportSection = {
    id: 'casino',
    title: t('report.section.casino'),
    facts: casinoList.length > 0 ? [
      { label: t('report.label.casinoSessions'), value: num(casinoList.length) },
      { label: t('report.label.hands'), value: num(casinoHands) },
      { label: t('report.label.netResult'), value: money(casinoNet, true) },
      { label: t('report.label.avgScore'), value: num(casinoList.reduce((n, s) => n + s.overallScore, 0) / casinoList.length) },
    ] : undefined,
    ...(casinoList.length > 0
      ? { table: {
        columns: [t('report.col.date'), t('report.col.hands'), t('report.col.duration'), t('report.col.start'), t('report.col.end'), t('report.col.result'), t('report.col.grade')],
        numeric: [false, true, true, true, true, true, false],
        rows: casinoList.map(s => [
          dateTime(s.timestamp), num(s.handsPlayed), duration(s.duration),
          money(s.startingBankroll), money(s.finalBankroll), money(s.profit, true),
          `${s.grade} (${num(s.overallScore)})`,
        ]),
      } }
      : { empty: t('report.empty.casino') }),
  }

  // ── Recent sessions ──
  const recentList = [...sessionsByTime].reverse().slice(0, RECENT_LIMIT)
  const recent: ReportSection = {
    id: 'recent',
    title: t('report.section.recent', { count: RECENT_LIMIT }),
    ...(recentList.length > 0
      ? { table: {
        columns: [t('report.col.date'), t('report.col.mode'), t('report.col.questions'), t('report.col.accuracy'), t('report.col.duration')],
        numeric: [false, false, true, true, true],
        rows: recentList.map(s => [dateTime(s.timestamp), mode(s.mode), num(s.totalQuestions), pct(s.accuracy), duration(s.durationSeconds)]),
      } }
      : { empty: t('report.empty.sessions') }),
  }

  // ── Achievements ──
  const unlocked = [...input.unlocked].sort((a, b) => b.unlockedAt - a.unlockedAt)
  const achievements: ReportSection = {
    id: 'achievements',
    title: t('report.section.achievements'),
    ...(unlocked.length > 0
      ? { table: {
        columns: [t('report.col.date'), t('report.col.achievement'), t('report.col.description')],
        numeric: [false, false, false],
        rows: unlocked.map(u => [date(u.unlockedAt), achText(u.achievementId, 'name'), achText(u.achievementId, 'desc')]),
      } }
      : { empty: t('report.empty.achievements') }),
  }

  // ── Real-money bankroll log ──
  const bankrollList = [...input.bankroll].sort((a, b) => b.date.localeCompare(a.date))
  const bankroll: ReportSection = {
    id: 'bankroll',
    title: t('report.section.bankroll'),
    facts: bankrollList.length > 0 ? [
      { label: t('report.label.entries'), value: num(bankrollList.length) },
      { label: t('report.label.netResult'), value: money(bankrollList.reduce((n, s) => n + s.result, 0), true) },
      { label: t('report.label.hoursPlayed'), value: num(bankrollList.reduce((n, s) => n + s.hoursPlayed, 0), 1) },
    ] : undefined,
    ...(bankrollList.length > 0
      ? { table: {
        columns: [t('report.col.date'), t('report.col.casino'), t('report.col.hours'), t('report.col.result'), t('report.col.notes')],
        numeric: [false, false, true, true, false],
        rows: bankrollList.map(s => [date(s.date), s.casino || dash, num(s.hoursPlayed, 1), money(s.result, true), s.notes || '']),
      } }
      : { empty: t('report.empty.bankroll') }),
  }

  const about: ReportSection = { id: 'about', title: t('report.section.about'), text: t('report.aboutText') }

  return {
    title: t('report.title'),
    subtitle: t('report.subtitle'),
    generated: t('report.generated', { date: dateTime(now) }),
    brand: 'black-jack-training.com',
    sections: [profile, training, byMode, casino, recent, achievements, bankroll, about],
  }
}

/** File name for a report made at `now`, e.g. `blackjack-trainer-account-2026-10-08.pdf`. */
export function reportFileName(now: Date, ext: 'pdf' | 'docx' | 'xlsx'): string {
  return `blackjack-trainer-account-${now.toISOString().slice(0, 10)}.${ext}`
}
