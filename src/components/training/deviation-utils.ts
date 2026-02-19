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

/** Format TC as "+N" or "N". */
export function formatTC(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}
