import { ILLUSTRIOUS_18, FAB_4 } from '../../engine/counting/deviations'
import { Action } from '../../engine/rules/types'
import type { Deviation } from '../../engine/counting/types'

export type DeviationSet = 'i18' | 'fab4' | 'all'

/** Human-readable action labels. */
export const ACTION_LABEL: Record<string, string> = {
  [Action.Hit]: 'Hit',
  [Action.Stand]: 'Stand',
  [Action.Double]: 'Double',
  [Action.Split]: 'Split',
  [Action.Surrender]: 'Surrender',
  [Action.Insurance]: 'Insurance',
}

/** Returns the deviation set based on user selection. */
export function getDeviations(set: DeviationSet): Deviation[] {
  switch (set) {
    case 'i18': return ILLUSTRIOUS_18
    case 'fab4': return FAB_4
    case 'all': return [...ILLUSTRIOUS_18, ...FAB_4]
  }
}

/** Fixed order of all action buttons — layout never changes. */
export const ALL_ACTIONS: Action[] = [
  Action.Hit, Action.Stand, Action.Double, Action.Split, Action.Surrender, Action.Insurance,
]

/**
 * Determines which actions are enabled for a Flash Card deviation question.
 * All buttons are always shown; disabled ones appear greyed out.
 */
export function getFlashCardActionEnabled(deviation: Deviation): Record<string, boolean> {
  const isPair = deviation.playerHand.includes(',')
  const isDealerAce = deviation.dealerUpcard === 'A'

  return {
    [Action.Hit]: true,
    [Action.Stand]: true,
    [Action.Double]: true,      // All deviation hands are initial 2-card hands
    [Action.Split]: isPair,
    [Action.Surrender]: true,   // All deviation hands are initial 2-card hands
    [Action.Insurance]: isDealerAce,
  }
}

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
 * Returns the basic strategy action for a deviation
 * (what you would do without counting).
 */
export function getBasicAction(deviation: Deviation): Action {
  return isReversedDeviation(deviation) ? deviation.actionAbove : deviation.actionBelow
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
