import { ILLUSTRIOUS_18, FAB_4 } from '../../engine/counting/deviations'
import { Action } from '../../engine/rules/types'
import type { Deviation } from '../../engine/counting/types'

export type DeviationSet = 'i18' | 'fab4' | 'all'

/**
 * Translation keys for the action names.
 *
 * Keys rather than English, because these five words are the vocabulary of the
 * whole app — they appear on the flashcard buttons, in its feedback and on the
 * strategy chart. One place to translate them, not three.
 */
export const ACTION_KEY: Record<string, string> = {
  [Action.Hit]: 'actions.hit',
  [Action.Stand]: 'actions.stand',
  [Action.Double]: 'actions.double',
  [Action.Split]: 'actions.split',
  [Action.Surrender]: 'actions.surrender',
  [Action.Insurance]: 'actions.insurance',
}

/** Returns the deviation set based on user selection. */
export function getDeviations(set: DeviationSet): Deviation[] {
  switch (set) {
    case 'i18': return ILLUSTRIOUS_18
    case 'fab4': return FAB_4
    case 'all': return [...ILLUSTRIOUS_18, ...FAB_4]
  }
}

/**
 * Returns deviations filtered for at-the-table mode.
 *
 * Excludes Insurance because it is a side bet, not a play decision.
 * Insurance is only trained in the flash-card mode where it works
 * correctly as a standalone question.
 */
export function getAtTableDeviations(set: DeviationSet): Deviation[] {
  return getDeviations(set).filter(d => d.name !== 'Insurance')
}

/** Fixed order of all action buttons — layout never changes. */
export const ALL_ACTIONS: Action[] = [
  Action.Hit, Action.Stand, Action.Double, Action.Split, Action.Surrender, Action.Insurance,
]

/** Names of reversed deviations (I18 #14-18: BS=Stand, deviate to Hit at low TC). */
const REVERSED_DEVIATION_NAMES = new Set([
  '13 vs 2', '12 vs 4', '12 vs 5', '12 vs 6', '13 vs 3',
])

/**
 * Whether a deviation is "reversed" (deviation fires BELOW threshold).
 *
 * Standard deviations: actionAbove = deviation, actionBelow = basic strategy.
 * Reversed deviations: actionAbove = basic strategy (Stand), actionBelow = deviation (Hit).
 */
export function isReversedDeviation(deviation: Deviation): boolean {
  return REVERSED_DEVIATION_NAMES.has(deviation.name)
}

/**
 * Returns the deviation action (what you do when the deviation fires).
 */
export function getDeviationAction(deviation: Deviation): Action {
  return isReversedDeviation(deviation) ? deviation.actionBelow : deviation.actionAbove
}

/** Format TC as "+N" or "N". */
export function formatTC(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

/** The key that answers with each play. Upper case; matched case-insensitively. */
export const ACTION_SHORTCUT: Record<Action, string> = {
  [Action.Hit]: 'H',
  [Action.Stand]: 'S',
  [Action.Double]: 'D',
  [Action.Split]: 'P',
  [Action.Surrender]: 'R',
  [Action.Insurance]: 'I',
}

/**
 * The play a key press answers with, or null.
 *
 * @param key - `KeyboardEvent.key`
 */
export function actionForKey(key: string): Action | null {
  const k = key.toUpperCase()
  return ALL_ACTIONS.find(a => ACTION_SHORTCUT[a] === k) ?? null
}

/** Percent in the reader's language: "80 %", "%80", "80%". */
export function formatPercent(n: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(n)
  } catch {
    return `${Math.round(n * 100)}%`
  }
}
