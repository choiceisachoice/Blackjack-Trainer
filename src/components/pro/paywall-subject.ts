import { CURRICULUM } from '../../services/curriculum'
import type { AppMode } from '../../store/app-store'
import type { PaywallLine } from './paywall-line'

/**
 * The three things the paywall leads with, in the order it lists them.
 *
 * Not every Pro capability — the full comparison is one click further — but
 * the three a counter would pay for: the table with the count and their own
 * rules, the count-based deviations, and the two drills that turn a count
 * into a bet (`FEATURE_GROUPS` rows r4, r6, and r2 + r3). The analytics and
 * the bankroll tracker are Pro too and stay in the full list; leading with
 * five things is how the paywall turned into the wall it replaced.
 */
export const PAYWALL_SUBJECTS = ['table', 'deviations', 'drills'] as const

/** One of the three things the paywall shows a picture of. */
export type PaywallSubject = (typeof PAYWALL_SUBJECTS)[number]

/** The screens whose lock is about one of the three. */
const SUBJECT_BY_MODE: Partial<Record<AppMode, PaywallSubject>> = {
  casinoSession: 'table',
  betSpread: 'drills',
  deckEstimation: 'drills',
  strategyChart: 'deviations',
}

/**
 * Which of the three a screen is about, if any.
 *
 * @param mode - The screen the visitor tried to open, or is on
 */
export function subjectForMode(mode: AppMode | null | undefined): PaywallSubject | null {
  return mode ? SUBJECT_BY_MODE[mode] ?? null : null
}

/**
 * Which of the three the personal line points at.
 *
 * The line names the Pro stage it is about by its title key — in `support`
 * ("next on your plan: …", "further along: …") or, when the stage the
 * learner is on is itself the Pro one, in `lead`. The stage's drill says
 * which screen that is, and the screen says which picture. Read from the
 * curriculum, so the picture cannot name a different stage from the words.
 *
 * @param line - The personal line, or null when there is none
 */
export function subjectForLine(line: PaywallLine | null): PaywallSubject | null {
  if (!line) return null
  const key = line.support.stageTitleKey ?? line.lead.stageTitleKey
  if (!key) return null
  const stage = CURRICULUM.find(s => s.titleKey === key)
  return subjectForMode(stage?.drill?.mode)
}

/** What decides the paywall's picture, strongest first. */
export interface PaywallSubjectInput {
  /** A caller that knows exactly what was locked (the public strategy chart). */
  explicit?: PaywallSubject | null
  /** The panel stands where the casino table would be. */
  atTable?: boolean
  /** The screen the visitor tried to open, or the one behind the modal. */
  mode?: AppMode | null
  /** The personal line, if the panel has one. */
  line?: PaywallLine | null
}

/**
 * The picture this visitor sees first: what they reached for, else what
 * their plan opens next, else the table — the flagship, and the one thing
 * every counter is training for.
 *
 * @param input - Everything the panel knows about why it is on screen
 */
export function paywallSubject({ explicit, atTable, mode, line }: PaywallSubjectInput): PaywallSubject {
  return explicit
    ?? (atTable ? 'table' : null)
    ?? subjectForMode(mode)
    ?? subjectForLine(line ?? null)
    ?? 'table'
}
